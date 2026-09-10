"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ApiSlot } from "./types";

export function SlotPicker({
  serviceId,
  clinicId,
  doctorId,
  excludeAppointmentId,
  value,
  onSelect,
}: {
  serviceId: string;
  clinicId?: string;
  doctorId?: string;
  excludeAppointmentId?: string;
  value: ApiSlot | null;
  onSelect: (slot: ApiSlot) => void;
}) {
  const [slots, setSlots] = React.useState<ApiSlot[]>([]);
  const [loadedKey, setLoadedKey] = React.useState("");
  const [error, setError] = React.useState("");

  const fetchKey = `${serviceId}|${clinicId ?? ""}|${doctorId ?? ""}|${excludeAppointmentId ?? ""}`;
  const loading = Boolean(serviceId) && loadedKey !== fetchKey;

  React.useEffect(() => {
    if (!serviceId) return;
    let alive = true;
    const params = new URLSearchParams({ serviceId, days: "10" });
    if (clinicId) params.set("clinicId", clinicId);
    if (doctorId) params.set("doctorId", doctorId);
    if (excludeAppointmentId) params.set("excludeAppointmentId", excludeAppointmentId);
    fetch(`/api/admin/slots?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        setError(data.error ? data.message ?? data.error : "");
        setSlots(data.slots ?? []);
        setLoadedKey(fetchKey);
      })
      .catch(() => {
        if (!alive) return;
        setError("Failed to load slots");
        setLoadedKey(fetchKey);
      });
    return () => {
      alive = false;
    };
  }, [serviceId, clinicId, doctorId, excludeAppointmentId, fetchKey]);

  if (!serviceId)
    return <p className="text-sm text-muted-foreground">Choose a service first.</p>;
  if (loading)
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (slots.length === 0)
    return <p className="text-sm text-muted-foreground">No free slots in the next 10 days.</p>;

  const byDay = new Map<string, ApiSlot[]>();
  for (const s of slots) {
    const day = formatInTimeZone(new Date(s.startsAt), s.timezone, "EEE, d MMM");
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
      {[...byDay.entries()].map(([day, daySlots]) => (
        <div key={day}>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">{day}</div>
          <div className="flex flex-wrap gap-1.5">
            {daySlots.map((s) => {
              const selected = value?.startsAt === s.startsAt && value?.doctorId === s.doctorId;
              return (
                <button
                  key={`${s.doctorId}-${s.startsAt}`}
                  type="button"
                  onClick={() => onSelect(s)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-primary/50 hover:bg-accent"
                  )}
                  title={s.doctorName}
                >
                  {formatInTimeZone(new Date(s.startsAt), s.timezone, "HH:mm")}
                  <span className={cn("ml-1", selected ? "opacity-80" : "text-muted-foreground")}>
                    · {s.doctorName.split(" ").slice(-1)[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
