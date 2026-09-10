"use client";

import * as React from "react";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/admin/status-badge";
import { SlotPicker } from "./slot-picker";
import type { ApiSlot, CalAppointment } from "./types";
import {
  cancelAppointmentAction,
  rescheduleAppointmentAction,
  saveAppointmentNotesAction,
  setAppointmentStatusAction,
} from "@/app/(admin)/calendar/actions";

export function AppointmentSheet({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: CalAppointment | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = React.useState<"view" | "reschedule">("view");
  const [slot, setSlot] = React.useState<ApiSlot | null>(null);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const [prevAppointment, setPrevAppointment] = React.useState(appointment);
  if (appointment !== prevAppointment) {
    setPrevAppointment(appointment);
    setMode("view");
    setSlot(null);
    setNotes(appointment?.notes ?? "");
  }

  if (!appointment) return null;
  const a = appointment;
  const tz = a.clinic.timezone;
  const editable = a.status === "BOOKED" || a.status === "CONFIRMED";

  async function run<T extends { ok: boolean; error?: string }>(p: Promise<T>, okMsg: string) {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Action failed");
      return false;
    }
    toast.success(okMsg);
    onChanged();
    return true;
  }

  return (
    <>
      <Sheet open={!!appointment} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-105 overflow-y-auto sm:max-w-105">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {a.patient.firstName} {a.patient.lastName}
              <StatusBadge status={a.status} />
            </SheetTitle>
            <SheetDescription>
              {a.service.name} · {a.service.durationMin} min
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-6">
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">
                {formatInTimeZone(new Date(a.startsAt), tz, "EEEE, d MMMM yyyy")}
              </div>
              <div className="text-muted-foreground">
                {formatInTimeZone(new Date(a.startsAt), tz, "HH:mm")} – {formatInTimeZone(new Date(a.endsAt), tz, "HH:mm")} ({tz})
              </div>
              <Separator className="my-2" />
              <div>{a.doctor.title} {a.doctor.name}</div>
              <div className="text-muted-foreground">{a.clinic.name}, {a.clinic.city}</div>
              <Separator className="my-2" />
              <div className="text-xs text-muted-foreground">
                Phone {a.patient.phone} · Source {a.source.toLowerCase().replace(/_/g, " ")} · v{a.version}
              </div>
            </div>

            {mode === "view" && (
              <>
                {editable && (
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={a.status}
                      onValueChange={(v) =>
                        run(
                          setAppointmentStatusAction({
                            appointmentId: a.id,
                            status: v as "BOOKED",
                          }),
                          "Status updated"
                        )
                      }
                    >
                      <SelectTrigger disabled={busy}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BOOKED">Booked</SelectItem>
                        <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="NO_SHOW">No-show</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal notes..."
                    rows={3}
                  />
                  {notes !== a.notes && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          saveAppointmentNotesAction({ appointmentId: a.id, notes }),
                          "Notes saved"
                        )
                      }
                    >
                      Save notes
                    </Button>
                  )}
                </div>

                {editable && (
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1" variant="outline" onClick={() => setMode("reschedule")}>
                      Reschedule
                    </Button>
                    <Button
                      className="flex-1"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setConfirmCancel(true)}
                    >
                      Cancel visit
                    </Button>
                  </div>
                )}
              </>
            )}

            {mode === "reschedule" && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Pick a new slot</div>
                <SlotPicker
                  serviceId={a.service.id}
                  clinicId={a.clinic.id}
                  excludeAppointmentId={a.id}
                  value={slot}
                  onSelect={setSlot}
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setMode("view")}>
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!slot || busy}
                    onClick={() =>
                      slot &&
                      run(
                        rescheduleAppointmentAction({
                          appointmentId: a.id,
                          version: a.version,
                          newStartsAtIso: slot.startsAt,
                          newDoctorId: slot.doctorId,
                        }),
                        "Appointment rescheduled"
                      )
                    }
                  >
                    Confirm new time
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              {a.patient.firstName} {a.patient.lastName} — {a.service.name},{" "}
              {formatInTimeZone(new Date(a.startsAt), tz, "d MMM HH:mm")}. If backfill is enabled,
              the freed slot will be offered to patients with later appointments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const res = await cancelAppointmentAction({
                  appointmentId: a.id,
                  reason: "Cancelled by staff",
                });
                if (!res.ok) {
                  toast.error(res.error ?? "Failed");
                  return;
                }
                toast.success(
                  res.offersCreated
                    ? `Cancelled. ${res.offersCreated} earlier-slot offer(s) sent to waiting patients.`
                    : "Appointment cancelled"
                );
                onChanged();
              }}
            >
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
