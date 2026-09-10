"use client";

import * as React from "react";
import { addDays, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalAppointment, CalClinic, CalDoctor, CalPatient, CalService } from "./types";
import { AppointmentSheet } from "./appointment-sheet";
import { NewAppointmentDialog } from "./new-appointment-dialog";

const START_HOUR = 7;
const END_HOUR = 20;
const PX_PER_MIN = 1.05;
const GRID_HEIGHT = (END_HOUR - START_HOUR) * 60 * PX_PER_MIN;

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
  const [view, setView] = React.useState<"day" | "week">("day");
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [appointments, setAppointments] = React.useState<CalAppointment[]>([]);
  const [loadedKey, setLoadedKey] = React.useState("");
  const [selected, setSelected] = React.useState<CalAppointment | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

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

  // Day view: one column per doctor; Week view: one column per day
  const columns =
    view === "day"
      ? (doctorId === "all" ? clinicDoctors : clinicDoctors.filter((d) => d.id === doctorId)).map((d) => ({
          key: d.id,
          title: d.name,
          color: d.color,
          filter: (a: CalAppointment) => a.doctor.id === d.id,
          day: days[0],
        }))
      : days.map((day) => ({
          key: day.toISOString(),
          title: formatInTimeZone(day, tz, "EEE d MMM"),
          color: undefined as string | undefined,
          filter: (a: CalAppointment) =>
            formatInTimeZone(new Date(a.startsAt), tz, "yyyy-MM-dd") ===
            formatInTimeZone(day, tz, "yyyy-MM-dd"),
          day,
        }));

  function minutesInDay(iso: string, day: Date) {
    void day;
    const h = Number(formatInTimeZone(new Date(iso), tz, "H"));
    const m = Number(formatInTimeZone(new Date(iso), tz, "m"));
    return h * 60 + m;
  }

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const title =
    view === "day"
      ? formatInTimeZone(days[0], tz, "EEEE, d MMMM yyyy")
      : `${formatInTimeZone(days[0], tz, "d MMM")} — ${formatInTimeZone(days[6], tz, "d MMM yyyy")}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={clinicId} onValueChange={(v) => { setClinicId(v); setDoctorId("all"); }}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {clinics.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.city} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={doctorId} onValueChange={setDoctorId}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All doctors</SelectItem>
            {clinicDoctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <Button variant="outline" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor((a) => addDays(a, view === "day" ? 1 : 7))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button className="ml-2" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> New appointment
          </Button>
        </div>
      </div>

      <div className="text-sm font-medium">{title}
        <span className="ml-2 text-xs font-normal text-muted-foreground">local time {tz}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        {loading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="flex min-w-fit">
            {/* time gutter */}
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
              const items = appointments.filter(col.filter).map((a) => ({
                a,
                startMin: minutesInDay(a.startsAt, col.day),
                endMin: minutesInDay(a.startsAt, col.day) + a.service.durationMin,
              }));
              const { placed, laneCount } = packLanes(items);
              return (
                <div key={col.key} className="min-w-44 flex-1 border-r last:border-r-0">
                  <div className="flex h-9 items-center gap-1.5 border-b px-2 text-xs font-medium">
                    {col.color && (
                      <span className="size-2 rounded-full" style={{ background: col.color }} />
                    )}
                    <span className="truncate">{col.title}</span>
                  </div>
                  <div className="relative" style={{ height: GRID_HEIGHT }}>
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-dashed border-border/60"
                        style={{ top: (h - START_HOUR) * 60 * PX_PER_MIN }}
                      />
                    ))}
                    {placed.map(({ item, laneIdx }) => {
                      const top = (item.startMin - START_HOUR * 60) * PX_PER_MIN;
                      const height = Math.max(22, (item.endMin - item.startMin) * PX_PER_MIN - 2);
                      const width = 100 / laneCount;
                      const cancelled = item.a.status === "CANCELLED";
                      const done = item.a.status === "COMPLETED" || item.a.status === "NO_SHOW";
                      return (
                        <button
                          key={item.a.id}
                          onClick={() => setSelected(item.a)}
                          className="absolute overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-xs transition-opacity hover:opacity-90"
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
                          }}
                        >
                          <div className={`font-medium ${cancelled ? "line-through" : ""}`}>
                            {formatInTimeZone(new Date(item.a.startsAt), tz, "HH:mm")}{" "}
                            {item.a.patient.firstName} {item.a.patient.lastName}
                          </div>
                          <div className="truncate text-muted-foreground">{item.a.service.name}</div>
                          {view === "week" && doctorId === "all" && (
                            <div className="truncate text-muted-foreground">{item.a.doctor.name}</div>
                          )}
                        </button>
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
