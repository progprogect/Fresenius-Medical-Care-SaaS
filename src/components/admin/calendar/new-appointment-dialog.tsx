"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SlotPicker } from "./slot-picker";
import type { ApiSlot, CalClinic, CalDoctor, CalPatient, CalService } from "./types";
import { createAppointmentAction } from "@/app/(admin)/calendar/actions";

export function NewAppointmentDialog({
  open, onOpenChange, clinics, doctors, services, patients, defaultClinicId, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clinics: CalClinic[];
  doctors: CalDoctor[];
  services: CalService[];
  patients: CalPatient[];
  defaultClinicId: string;
  onCreated: () => void;
}) {
  const [patientQuery, setPatientQuery] = React.useState("");
  const [patientId, setPatientId] = React.useState("");
  const [clinicId, setClinicId] = React.useState(defaultClinicId);
  const [serviceId, setServiceId] = React.useState("");
  const [doctorId, setDoctorId] = React.useState("any");
  const [slot, setSlot] = React.useState<ApiSlot | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setClinicId(defaultClinicId);
      setPatientQuery("");
      setPatientId("");
      setServiceId("");
      setDoctorId("any");
      setSlot(null);
    }
  }

  const slotContext = `${serviceId}|${clinicId}|${doctorId}`;
  const [prevSlotContext, setPrevSlotContext] = React.useState(slotContext);
  if (slotContext !== prevSlotContext) {
    setPrevSlotContext(slotContext);
    setSlot(null);
  }

  const matches = patientQuery.trim()
    ? patients.filter((p) =>
        `${p.name} ${p.phone}`.toLowerCase().includes(patientQuery.trim().toLowerCase())
      )
    : patients;
  const selectedPatient = patients.find((p) => p.id === patientId);
  const clinicDoctors = doctors.filter(
    (d) => d.clinicId === clinicId && (!serviceId || d.serviceIds.includes(serviceId))
  );

  async function create() {
    if (!patientId || !serviceId || !slot) return;
    setBusy(true);
    const res = await createAppointmentAction({
      patientId,
      doctorId: slot.doctorId,
      serviceId,
      startsAtIso: slot.startsAt,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Appointment created");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New appointment</DialogTitle>
          <DialogDescription>Book a visit manually on behalf of a patient.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Patient</Label>
            {selectedPatient ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  {selectedPatient.name}
                  <span className="ml-2 text-muted-foreground">{selectedPatient.phone}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => setPatientId("")}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Search by name or phone..."
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
                <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-1">
                  {matches.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPatientId(p.id)}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.phone}</span>
                    </button>
                  ))}
                  {matches.length === 0 && (
                    <p className="px-2 py-2 text-sm text-muted-foreground">No patients found.</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Clinic</Label>
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger>
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
            </div>
            <div className="space-y-2">
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.durationMin} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Doctor</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any available doctor</SelectItem>
                {clinicDoctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {serviceId && (
            <div className="space-y-2">
              <Label>Available slots</Label>
              <SlotPicker
                serviceId={serviceId}
                clinicId={clinicId}
                doctorId={doctorId === "any" ? undefined : doctorId}
                value={slot}
                onSelect={setSlot}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!patientId || !serviceId || !slot || busy} onClick={create}>
            {busy ? "Booking..." : "Book appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
