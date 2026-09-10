"use client";

import * as React from "react";
import { addDays, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight, GripVertical, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { CalAppointment, CalClinic, CalDoctor, CalPatient, CalService } from "./types";
import { AppointmentSheet } from "./appointment-sheet";
import { NewAppointmentDialog } from "./new-appointment-dialog";
import { rescheduleAppointmentAction } from "@/app/(admin)/calendar/actions";

const START_HOUR = 7;
const END_HOUR = 20;
const PX_PER_MIN = 1.05;
const GRID_HEIGHT = (END_HOUR - START_HOUR) * 60 * PX_PER_MIN;
const SNAP_MIN = 15;
const DRAG_THRESHOLD_PX = 4;

type Lane = { end: number };

function packLanes<T extends { startMin: number; endMin: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin);
  const lanes: Lane[] = [];
  const placed = sorted.map((item) => {
    let laneIdx = lanes.findIndex((l) => l.end <= item.startMin);
    if (laneIdx === -1) {
      lanes.push({ end: item.endMin });
      laneIdx = lanes.length - 1;
    } else {
      lanes[laneIdx].end = item.endMin;
    }
    return { item, laneIdx };
  });
  return { placed, laneCount: Math.max(1, lanes.length) };
}

type DragState = {
  appointment: CalAppointment;
  originColumnKey: string;
  pointerId: number;
  startX: number;
  startY: number;
};

type DragView = {
  id: string;
  offsetMin: number;
  offsetX: number;
  targetColumnKey: string;
  moved: boolean;
};

export function CalendarView({
  clinics, doctors, services, patients,
}: {
  clinics: CalClinic[];
  doctors: CalDoctor[];
  services: CalService[];
  patients: CalPatient[];
}) {
  const [clinicId, setClinicId] = React.useState(clinics[0]?.id ?? "");
  const [doctorId, setDoctorId] = React.useState<string>("all");
  const [serviceId, setServiceId] = React.useState<string>("all");
  const [status, setStatus] = React.useState<string>("open");
  const [source, setSource] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<"day" | "week">("day");
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [appointments, setAppointments] = React.useState<CalAppointment[]>([]);
  const [loadedKey, setLoadedKey] = React.useState("");
  const [selected, setSelected] = React.useState<CalAppointment | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [dragView, setDragView] = React.useState<DragView | null>(null);
  const [saving, setSaving] = React.useState(false);
  const columnRefs = React.useRef(new Map<string, HTMLDivElement>());
  const dragRef = React.useRef<DragState | null>(null);
  const dragViewRef = React.useRef<DragView | null>(null);
  const commitRef = React.useRef<(view: DragView) => void>(() => {});

  const clinic = clinics.find((c) => c.id === clinicId) ?? clinics[0];
  const tz = clinic?.timezone ?? "Europe/Berlin";
  const clinicDoctors = doctors.filter((d) => d.clinicId === clinicId);

  const rangeStart = React.useMemo(() => {
    const dayStr = formatInTimeZone(anchor, tz, "yyyy-MM-dd");
    if (view === "day") return fromZonedTime(`${dayStr}T00:00:00`, tz);
    const monday = startOfWeek(new Date(`${dayStr}T12:00:00`), { weekStartsOn: 1 });
    return fromZonedTime(`${formatInTimeZone(monday, tz, "yyyy-MM-dd")}T00:00:00`, tz);
  }, [anchor, tz, view]);
  const rangeDays = view === "day" ? 1 : 7;
  const rangeEnd = React.useMemo(() => addDays(rangeStart, rangeDays), [rangeStart, rangeDays]);

  const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  const fetchKey = `${rangeStart.toISOString()}|${rangeEnd.toISOString()}|${clinicId}|${doctorId}|${refreshKey}`;
  const loading = loadedKey !== fetchKey;

  React.useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
      clinicId,
    });
    if (doctorId !== "all") params.set("doctorId", doctorId);
    fetch(`/api/admin/appointments?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setAppointments(data.appointments ?? []);
        setLoadedKey(fetchKey);
      })
      .catch(() => alive && setLoadedKey(fetchKey));
    return () => {
      alive = false;
    };
  }, [rangeStart, rangeEnd, clinicId, doctorId, refreshKey, fetchKey]);

  const days = Array.from({ length: rangeDays }, (_, i) => addDays(rangeStart, i));

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return appointments.filter((a) => {
      if (serviceId !== "all" && a.service.id !== serviceId) return false;
      if (source !== "all" && a.source !== source) return false;
      if (status === "open" && (a.status === "CANCELLED" || a.status === "COMPLETED" || a.status === "NO_SHOW"))
        return false;
      if (status !== "all" && status !== "open" && a.status !== status) return false;
      if (q) {
        const hay = `${a.patient.firstName} ${a.patient.lastName} ${a.patient.phone} ${a.service.name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [appointments, serviceId, source, status, query]);

  const columns =
    view === "day"
      ? (doctorId === "all" ? clinicDoctors : clinicDoctors.filter((d) => d.id === doctorId)).map((d) => ({
          key: d.id,
          title: d.name,
          color: d.color as string | undefined,
          doctorId: d.id,
          dayStr: formatInTimeZone(days[0], tz, "yyyy-MM-dd"),
          filter: (a: CalAppointment) => a.doctor.id === d.id,
        }))
      : days.map((day) => ({
          key: formatInTimeZone(day, tz, "yyyy-MM-dd"),
          title: formatInTimeZone(day, tz, "EEE d MMM"),
          color: undefined as string | undefined,
          doctorId: undefined as string | undefined,
          dayStr: formatInTimeZone(day, tz, "yyyy-MM-dd"),
          filter: (a: CalAppointment) =>
            formatInTimeZone(new Date(a.startsAt), tz, "yyyy-MM-dd") ===
            formatInTimeZone(day, tz, "yyyy-MM-dd"),
        }));

  function minutesOf(iso: string) {
    const h = Number(formatInTimeZone(new Date(iso), tz, "H"));
    const m = Number(formatInTimeZone(new Date(iso), tz, "m"));
    return h * 60 + m;
  }

  const isDraggable = (a: CalAppointment) => a.status === "BOOKED" || a.status === "CONFIRMED";

  function onPointerDown(e: React.PointerEvent, a: CalAppointment, columnKey: string) {
    if (!isDraggable(a) || saving || dragRef.current) return;
    dragRef.current = {
      appointment: a,
      originColumnKey: columnKey,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
    const initial: DragView = {
      id: a.id, offsetMin: 0, offsetX: 0, targetColumnKey: columnKey, moved: false,
    };
    dragViewRef.current = initial;
    setDragView(initial);
  }

  const commit = (viewState: DragView) => {
    const session = dragRef.current;
    if (!session) return;
    const a = session.appointment;

    if (!viewState.moved) {
      setSelected(a);
      return;
    }
    const targetColumn = columns.find((c) => c.key === viewState.targetColumnKey);
    if (!targetColumn) return;

    const newMin = minutesOf(a.startsAt) + viewState.offsetMin;
    const sameSlot =
      viewState.offsetMin === 0 && viewState.targetColumnKey === session.originColumnKey;
    if (sameSlot) return;

    if (newMin < START_HOUR * 60 || newMin + a.service.durationMin > END_HOUR * 60) {
      toast.error(`Outside the visible day (${START_HOUR}:00–${END_HOUR}:00)`);
      return;
    }

    const hh = String(Math.floor(newMin / 60)).padStart(2, "0");
    const mm = String(newMin % 60).padStart(2, "0");
    const newStart = fromZonedTime(`${targetColumn.dayStr}T${hh}:${mm}:00`, tz);
    const newDoctorId = view === "day" ? targetColumn.doctorId : a.doctor.id;

    setSaving(true);
    void rescheduleAppointmentAction({
      appointmentId: a.id,
      version: a.version,
      newStartsAtIso: newStart.toISOString(),
      newDoctorId,
    })
      .then((res) => {
        if (!res.ok) toast.error(res.error);
        else
          toast.success(
            `Moved to ${formatInTimeZone(newStart, tz, "EEE d MMM, HH:mm")}${
              newDoctorId && newDoctorId !== a.doctor.id ? ` · ${targetColumn.title}` : ""
            }`
          );
      })
      .finally(() => {
        setSaving(false);
        refresh();
      });
  };

  // Kept in a ref so the window listeners below never call a stale closure.
  React.useEffect(() => {
    commitRef.current = commit;
  });

  /**
   * Drag is tracked on window, not on the block: the block can re-render or
   * move between columns mid-gesture, and an element-bound pointerup would then
   * never fire, stranding the appointment mid-drag.
   */
  React.useEffect(() => {
    if (!dragView) return;

    function currentColumnKey(clientX: number, clientY: number) {
      for (const [key, el] of columnRefs.current.entries()) {
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top - 48 && clientY <= r.bottom + 48)
          return key;
      }
      return null;
    }

    function onMove(e: PointerEvent) {
      const session = dragRef.current;
      const prev = dragViewRef.current;
      if (!session || !prev || e.pointerId !== session.pointerId) return;
      const dy = e.clientY - session.startY;
      const dx = e.clientX - session.startX;
      const moved = prev.moved || Math.abs(dy) > DRAG_THRESHOLD_PX || Math.abs(dx) > DRAG_THRESHOLD_PX;
      if (!moved) return;
      const offsetMin = Math.round(dy / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
      const targetColumnKey = currentColumnKey(e.clientX, e.clientY) ?? prev.targetColumnKey;
      const originEl = columnRefs.current.get(session.originColumnKey);
      const targetEl = columnRefs.current.get(targetColumnKey);
      const offsetX =
        originEl && targetEl
          ? targetEl.getBoundingClientRect().left - originEl.getBoundingClientRect().left
          : 0;
      const next: DragView = { ...prev, offsetMin, offsetX, targetColumnKey, moved: true };
      dragViewRef.current = next;
      setDragView(next);
    }

    function onUp(e: PointerEvent) {
      const session = dragRef.current;
      const finalView = dragViewRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      setDragView(null);
      // Commit outside the state updater: it triggers navigation and toasts,
      // which must never run during React's render phase.
      if (finalView) commitRef.current(finalView);
      dragRef.current = null;
      dragViewRef.current = null;
    }

    function onCancel() {
      dragRef.current = null;
      dragViewRef.current = null;
      setDragView(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [dragView]);

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const title =
    view === "day"
      ? formatInTimeZone(days[0], tz, "EEEE, d MMMM yyyy")
      : `${formatInTimeZone(days[0], tz, "d MMM")} — ${formatInTimeZone(days[6], tz, "d MMM yyyy")}`;

  const clinicServiceIds = new Set(clinicDoctors.flatMap((d) => d.serviceIds));
  const clinicServices = services.filter((s) => clinicServiceIds.has(s.id));
  const hiddenCount = appointments.length - visible.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={clinicId} onValueChange={(v) => { setClinicId(v); setDoctorId("all"); setServiceId("all"); }}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            {clinics.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.city} — {c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={doctorId} onValueChange={setDoctorId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All doctors</SelectItem>
            {clinicDoctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={serviceId} onValueChange={setServiceId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {clinicServices.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Active visits</SelectItem>
            <SelectItem value="all">Include cancelled</SelectItem>
            <SelectItem value="BOOKED">Booked only</SelectItem>
            <SelectItem value="CONFIRMED">Confirmed only</SelectItem>
            <SelectItem value="COMPLETED">Completed only</SelectItem>
            <SelectItem value="CANCELLED">Cancelled only</SelectItem>
            <SelectItem value="NO_SHOW">No-shows</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any source</SelectItem>
            <SelectItem value="WIDGET_CHAT">Widget chat</SelectItem>
            <SelectItem value="WIDGET_VOICE">Widget voice</SelectItem>
            <SelectItem value="PHONE">Phone</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            <SelectItem value="MANUAL">Staff</SelectItem>
            <SelectItem value="BACKFILL">Slot offer</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Find patient..."
          className="w-44"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Tabs value={view} onValueChange={(v) => setView(v as "day" | "week")}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={() => setAnchor((a) => addDays(a, view === "day" ? -1 : -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor((a) => addDays(a, view === "day" ? 1 : 7))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button className="ml-2" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> New appointment
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">local time {tz}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <GripVertical className="size-3" />
          drag a visit to change its time{view === "day" ? " or doctor" : " or day"}
        </span>
        {hiddenCount > 0 && (
          <Badge variant="outline" className="font-normal">{hiddenCount} hidden by filters</Badge>
        )}
        {saving && <Badge variant="secondary" className="font-normal">saving…</Badge>}
        {dragView?.moved && (
          <Badge variant="secondary" className="font-normal">
            drop to move · release outside the grid to keep the current time
          </Badge>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        {loading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="flex min-w-fit">
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r bg-background">
              <div className="h-9 border-b" />
              <div className="relative" style={{ height: GRID_HEIGHT }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground"
                    style={{ top: (h - START_HOUR) * 60 * PX_PER_MIN }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
            </div>
            {columns.length === 0 && (
              <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">
                No doctors in this clinic.
              </div>
            )}
            {columns.map((col) => {
              const items = visible.filter(col.filter).map((a) => ({
                a,
                startMin: minutesOf(a.startsAt),
                endMin: minutesOf(a.startsAt) + a.service.durationMin,
              }));
              const { placed, laneCount } = packLanes(items);
              const isDropTarget = dragView?.moved && dragView.targetColumnKey === col.key;
              return (
                <div
                  key={col.key}
                  className={`min-w-44 flex-1 border-r last:border-r-0 ${isDropTarget ? "bg-primary/5" : ""}`}
                >
                  <div className="flex h-9 items-center gap-1.5 border-b px-2 text-xs font-medium">
                    {col.color && <span className="size-2 rounded-full" style={{ background: col.color }} />}
                    <span className="truncate">{col.title}</span>
                  </div>
                  <div
                    ref={(el) => {
                      if (el) columnRefs.current.set(col.key, el);
                      else columnRefs.current.delete(col.key);
                    }}
                    className="relative"
                    style={{ height: GRID_HEIGHT }}
                  >
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-dashed border-border/60"
                        style={{ top: (h - START_HOUR) * 60 * PX_PER_MIN }}
                      />
                    ))}
                    {placed.map(({ item, laneIdx }) => {
                      const dragging = dragView?.id === item.a.id && dragView.moved;
                      const shownStart = dragging ? item.startMin + dragView.offsetMin : item.startMin;
                      const top = (shownStart - START_HOUR * 60) * PX_PER_MIN;
                      const height = Math.max(22, (item.endMin - item.startMin) * PX_PER_MIN - 2);
                      const width = 100 / laneCount;
                      const cancelled = item.a.status === "CANCELLED";
                      const done = item.a.status === "COMPLETED" || item.a.status === "NO_SHOW";
                      const movable = isDraggable(item.a);
                      return (
                        <div
                          key={item.a.id}
                          role="button"
                          tabIndex={0}
                          onPointerDown={(e) => onPointerDown(e, item.a, col.key)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(item.a);
                            }
                          }}
                          className={`group absolute select-none overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-xs outline-none transition-shadow hover:z-20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring ${
                            movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                          } ${dragging ? "z-30 opacity-90 shadow-lg ring-2 ring-primary" : ""}`}
                          style={{
                            top,
                            height,
                            left: `calc(${laneIdx * width}% + 2px)`,
                            width: `calc(${width}% - 4px)`,
                            background: cancelled
                              ? "var(--muted)"
                              : `color-mix(in oklab, ${item.a.doctor.color} ${done ? 8 : 16}%, white)`,
                            borderColor: cancelled
                              ? "var(--border)"
                              : `color-mix(in oklab, ${item.a.doctor.color} 45%, white)`,
                            opacity: cancelled ? 0.6 : 1,
                            touchAction: "none",
                            transform: dragging ? `translateX(${dragView.offsetX}px)` : undefined,
                          }}
                          title={
                            movable
                              ? "Drag to reschedule, click to open"
                              : `${item.a.status.toLowerCase()} — click to open`
                          }
                        >
                          <div className={`font-medium ${cancelled ? "line-through" : ""}`}>
                            {String(Math.floor(shownStart / 60)).padStart(2, "0")}:
                            {String(shownStart % 60).padStart(2, "0")}{" "}
                            {item.a.patient.firstName} {item.a.patient.lastName}
                          </div>
                          <div className="truncate text-muted-foreground">{item.a.service.name}</div>
                          {view === "week" && doctorId === "all" && (
                            <div className="truncate text-muted-foreground">{item.a.doctor.name}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AppointmentSheet
        appointment={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          refresh();
        }}
      />
      <NewAppointmentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        clinics={clinics}
        doctors={doctors}
        services={services}
        patients={patients}
        defaultClinicId={clinicId}
        onCreated={() => {
          setNewOpen(false);
          refresh();
        }}
      />
    </div>
  );
}
