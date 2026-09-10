import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import type { AppointmentSource, Prisma } from "@prisma/client";

export const SLOT_STEP_MIN = 30;
export const BOOKING_LEAD_MINUTES = 45; // earliest offerable slot from "now"
export const CANCEL_LEAD_MINUTES = 60; // AI-driven cancel/reschedule deadline

export type Slot = {
  startsAt: Date;
  endsAt: Date;
  doctorId: string;
  doctorName: string;
  clinicId: string;
  clinicName: string;
  clinicCity: string;
  timezone: string;
};

export class SchedulingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Compute free slots from doctors' working hours minus existing appointments.
 * All computation is clinic-timezone aware; slots are returned as UTC dates.
 */
export async function findAvailableSlots(params: {
  serviceId: string;
  clinicId?: string;
  doctorId?: string;
  fromDate?: Date;
  days?: number;
  limit?: number;
  excludeAppointmentId?: string;
}): Promise<Slot[]> {
  const { serviceId, clinicId, doctorId } = params;
  const days = Math.min(params.days ?? 7, 31);
  const limit = Math.min(params.limit ?? 30, 100);
  const now = new Date();
  const minStart = new Date(now.getTime() + BOOKING_LEAD_MINUTES * 60_000);
  const from = params.fromDate && params.fromDate > now ? params.fromDate : now;

  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.active)
    throw new SchedulingError("SERVICE_NOT_FOUND", "Unknown or inactive service");

  // An id that does not exist must fail loudly. Filtering on one silently
  // returns an empty list, which reads as "fully booked" to the caller.
  if (clinicId) {
    const clinic = await db.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic)
      throw new SchedulingError(
        "CLINIC_NOT_FOUND",
        "That clinic id does not exist. Call list_clinics and use the clinicId it returns."
      );
  }
  if (doctorId) {
    const doctor = await db.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor)
      throw new SchedulingError(
        "DOCTOR_NOT_FOUND",
        "That doctor id does not exist. Call list_doctors and use the doctorId it returns."
      );
  }

  const doctors = await db.doctor.findMany({
    where: {
      active: true,
      ...(doctorId ? { id: doctorId } : {}),
      ...(clinicId ? { clinicId } : {}),
      services: { some: { serviceId } },
      clinic: { active: true },
    },
    include: { clinic: true, workingHours: true },
  });
  if (doctors.length === 0) return [];

  const windowStart = from;
  const windowEnd = addDays(from, days);

  const appointments = await db.appointment.findMany({
    where: {
      doctorId: { in: doctors.map((d) => d.id) },
      status: { notIn: ["CANCELLED"] },
      startsAt: { lt: windowEnd },
      endsAt: { gt: windowStart },
      ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
    },
    select: { doctorId: true, startsAt: true, endsAt: true },
  });
  const busy = new Map<string, { s: number; e: number }[]>();
  for (const a of appointments) {
    const list = busy.get(a.doctorId) ?? [];
    list.push({ s: a.startsAt.getTime(), e: a.endsAt.getTime() });
    busy.set(a.doctorId, list);
  }

  const slots: Slot[] = [];
  const durMs = service.durationMin * 60_000;

  for (let dayOffset = 0; dayOffset <= days; dayOffset++) {
    const dayCursor = addDays(from, dayOffset);
    for (const doctor of doctors) {
      const tz = doctor.clinic.timezone;
      // calendar date string in the clinic's timezone
      const dateStr = formatInTimeZone(dayCursor, tz, "yyyy-MM-dd");
      const weekday = Number(formatInTimeZone(dayCursor, tz, "i")) % 7; // 0=Sun..6=Sat
      const ranges = doctor.workingHours.filter((w) => w.weekday === weekday);
      for (const range of ranges) {
        for (let m = range.startMin; m + service.durationMin <= range.endMin; m += SLOT_STEP_MIN) {
          const hh = String(Math.floor(m / 60)).padStart(2, "0");
          const mm = String(m % 60).padStart(2, "0");
          const start = fromZonedTime(`${dateStr}T${hh}:${mm}:00`, tz);
          const end = new Date(start.getTime() + durMs);
          if (start < minStart || end > windowEnd) continue;
          const conflicts = (busy.get(doctor.id) ?? []).some(
            (b) => start.getTime() < b.e && end.getTime() > b.s
          );
          if (conflicts) continue;
          slots.push({
            startsAt: start,
            endsAt: end,
            doctorId: doctor.id,
            doctorName: `${doctor.title} ${doctor.name}`,
            clinicId: doctor.clinicId,
            clinicName: doctor.clinic.name,
            clinicCity: doctor.clinic.city,
            timezone: tz,
          });
        }
      }
    }
  }

  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return slots.slice(0, limit);
}

/** Throws if the doctor is not free in [startsAt, endsAt). */
async function assertSlotFree(
  tx: Prisma.TransactionClient,
  doctorId: string,
  startsAt: Date,
  endsAt: Date,
  excludeAppointmentId?: string
) {
  const clash = await tx.appointment.findFirst({
    where: {
      doctorId,
      status: { notIn: ["CANCELLED"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { id: true },
  });
  if (clash)
    throw new SchedulingError(
      "SLOT_TAKEN",
      "This slot is no longer available. Please pick another one."
    );
}

export async function bookAppointment(params: {
  patientId: string;
  doctorId: string;
  serviceId: string;
  startsAt: Date;
  source: AppointmentSource;
  notes?: string;
  actor: string;
  allowDuplicate?: boolean;
}) {
  const service = await db.service.findUnique({ where: { id: params.serviceId } });
  if (!service) throw new SchedulingError("SERVICE_NOT_FOUND", "Unknown service");
  const doctor = await db.doctor.findUnique({
    where: { id: params.doctorId },
    include: { clinic: true, services: true },
  });
  if (!doctor || !doctor.active)
    throw new SchedulingError("DOCTOR_NOT_FOUND", "Unknown or inactive doctor");
  if (!doctor.services.some((s) => s.serviceId === params.serviceId))
    throw new SchedulingError(
      "DOCTOR_SERVICE_MISMATCH",
      `${doctor.name} does not provide this service`
    );

  const endsAt = new Date(params.startsAt.getTime() + service.durationMin * 60_000);
  if (params.startsAt < new Date())
    throw new SchedulingError("PAST_SLOT", "Cannot book a slot in the past");

  // UC-5 edge case: duplicate appointment detection
  if (!params.allowDuplicate) {
    const dup = await db.appointment.findFirst({
      where: {
        patientId: params.patientId,
        serviceId: params.serviceId,
        status: { in: ["BOOKED", "CONFIRMED"] },
        startsAt: { gt: new Date() },
      },
      include: { clinic: true },
    });
    if (dup)
      throw new SchedulingError(
        "DUPLICATE_APPOINTMENT",
        `The patient already has an upcoming appointment for this service on ${dup.startsAt.toISOString()} (id ${dup.id}). Ask the patient to confirm they want another one, then retry with allowDuplicate.`
      );
  }

  const appointment = await db.$transaction(async (tx) => {
    await assertSlotFree(tx, params.doctorId, params.startsAt, endsAt);
    return tx.appointment.create({
      data: {
        patientId: params.patientId,
        clinicId: doctor.clinicId,
        doctorId: params.doctorId,
        serviceId: params.serviceId,
        startsAt: params.startsAt,
        endsAt,
        source: params.source,
        notes: params.notes ?? "",
      },
      include: { patient: true, doctor: true, clinic: true, service: true },
    });
  });

  await logAudit({
    actor: params.actor,
    action: "APPOINTMENT_BOOKED",
    entity: "Appointment",
    entityId: appointment.id,
    details: {
      startsAt: appointment.startsAt.toISOString(),
      doctor: doctor.name,
      service: service.name,
      source: params.source,
    },
  });
  return appointment;
}

export async function rescheduleAppointment(params: {
  appointmentId: string;
  expectedVersion?: number;
  newStartsAt: Date;
  newDoctorId?: string;
  actor: string;
  source?: AppointmentSource;
  enforceLeadTime?: boolean;
}) {
  const current = await db.appointment.findUnique({
    where: { id: params.appointmentId },
    include: { service: true, doctor: true },
  });
  if (!current) throw new SchedulingError("NOT_FOUND", "Appointment not found");
  if (current.status === "CANCELLED" || current.status === "COMPLETED")
    throw new SchedulingError("NOT_MODIFIABLE", `Appointment is ${current.status.toLowerCase()}`);
  if (params.expectedVersion !== undefined && current.version !== params.expectedVersion)
    throw new SchedulingError(
      "VERSION_CONFLICT",
      "The appointment changed in the meantime. Re-read it and try again."
    );
  if (params.enforceLeadTime) {
    const deadline = new Date(current.startsAt.getTime() - CANCEL_LEAD_MINUTES * 60_000);
    if (new Date() > deadline)
      throw new SchedulingError(
        "DEADLINE_PASSED",
        `Rescheduling is only possible up to ${CANCEL_LEAD_MINUTES} minutes before the visit. Please call the clinic directly.`
      );
  }

  const doctorId = params.newDoctorId ?? current.doctorId;
  const newDoctor = await db.doctor.findUnique({ where: { id: doctorId }, include: { services: true } });
  if (!newDoctor) throw new SchedulingError("DOCTOR_NOT_FOUND", "Unknown doctor");
  if (!newDoctor.services.some((s) => s.serviceId === current.serviceId))
    throw new SchedulingError("DOCTOR_SERVICE_MISMATCH", `${newDoctor.name} does not provide this service`);
  const endsAt = new Date(params.newStartsAt.getTime() + current.service.durationMin * 60_000);
  if (params.newStartsAt < new Date())
    throw new SchedulingError("PAST_SLOT", "Cannot move an appointment into the past");

  const oldSlot = {
    doctorId: current.doctorId,
    clinicId: current.clinicId,
    serviceId: current.serviceId,
    startsAt: current.startsAt,
    endsAt: current.endsAt,
  };

  const updated = await db.$transaction(async (tx) => {
    await assertSlotFree(tx, doctorId, params.newStartsAt, endsAt, current.id);
    const res = await tx.appointment.updateMany({
      where: { id: current.id, version: current.version },
      data: {
        startsAt: params.newStartsAt,
        endsAt,
        doctorId,
        clinicId: newDoctor.clinicId,
        status: "BOOKED",
        version: { increment: 1 },
        ...(params.source ? { source: params.source } : {}),
      },
    });
    if (res.count === 0)
      throw new SchedulingError("VERSION_CONFLICT", "The appointment changed in the meantime.");
    return tx.appointment.findUniqueOrThrow({
      where: { id: current.id },
      include: { patient: true, doctor: true, clinic: true, service: true },
    });
  });

  await logAudit({
    actor: params.actor,
    action: "APPOINTMENT_RESCHEDULED",
    entity: "Appointment",
    entityId: updated.id,
    details: {
      from: oldSlot.startsAt.toISOString(),
      to: updated.startsAt.toISOString(),
      fromDoctor: current.doctor.name,
      toDoctor: newDoctor.name,
    },
  });

  return { updated, oldSlot };
}

export async function cancelAppointment(params: {
  appointmentId: string;
  reason?: string;
  actor: string;
  enforceLeadTime?: boolean;
}) {
  const current = await db.appointment.findUnique({
    where: { id: params.appointmentId },
    include: { patient: true, doctor: true, clinic: true, service: true },
  });
  if (!current) throw new SchedulingError("NOT_FOUND", "Appointment not found");
  if (current.status === "CANCELLED") return { cancelled: current, freedSlot: null };
  if (current.status === "COMPLETED")
    throw new SchedulingError("NOT_MODIFIABLE", "Appointment is already completed");
  if (params.enforceLeadTime) {
    const deadline = new Date(current.startsAt.getTime() - CANCEL_LEAD_MINUTES * 60_000);
    if (new Date() > deadline)
      throw new SchedulingError(
        "DEADLINE_PASSED",
        `Cancellation is only possible up to ${CANCEL_LEAD_MINUTES} minutes before the visit. Please call the clinic directly.`
      );
  }

  const cancelled = await db.appointment.update({
    where: { id: current.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: params.reason ?? null,
      version: { increment: 1 },
    },
    include: { patient: true, doctor: true, clinic: true, service: true },
  });

  await logAudit({
    actor: params.actor,
    action: "APPOINTMENT_CANCELLED",
    entity: "Appointment",
    entityId: cancelled.id,
    details: { reason: params.reason ?? "", startsAt: cancelled.startsAt.toISOString() },
  });

  const freedSlot =
    cancelled.startsAt > new Date()
      ? {
          doctorId: cancelled.doctorId,
          clinicId: cancelled.clinicId,
          serviceId: cancelled.serviceId,
          startsAt: cancelled.startsAt,
          endsAt: cancelled.endsAt,
        }
      : null;

  return { cancelled, freedSlot };
}
