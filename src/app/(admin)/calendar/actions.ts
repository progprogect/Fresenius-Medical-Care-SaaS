"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  SchedulingError,
} from "@/lib/scheduling";
import { createOffersForFreedSlot } from "@/lib/backfill";
import type { AppointmentStatus } from "@prisma/client";

type ActionResult = { ok: true } | { ok: false; error: string };

function fail(err: unknown): ActionResult {
  if (err instanceof SchedulingError) return { ok: false, error: err.message };
  console.error(err);
  return { ok: false, error: "Unexpected error" };
}

export async function createAppointmentAction(input: {
  patientId: string;
  doctorId: string;
  serviceId: string;
  startsAtIso: string;
  notes?: string;
  allowDuplicate?: boolean;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    await bookAppointment({
      patientId: input.patientId,
      doctorId: input.doctorId,
      serviceId: input.serviceId,
      startsAt: new Date(input.startsAtIso),
      source: "MANUAL",
      notes: input.notes,
      actor: `user:${session.id}`,
      allowDuplicate: input.allowDuplicate,
    });
    revalidatePath("/calendar");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function rescheduleAppointmentAction(input: {
  appointmentId: string;
  version: number;
  newStartsAtIso: string;
  newDoctorId?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    const { oldSlot } = await rescheduleAppointment({
      appointmentId: input.appointmentId,
      expectedVersion: input.version,
      newStartsAt: new Date(input.newStartsAtIso),
      newDoctorId: input.newDoctorId,
      actor: `user:${session.id}`,
    });
    createOffersForFreedSlot(oldSlot, "system:backfill").catch((e) =>
      console.error("backfill failed", e)
    );
    revalidatePath("/calendar");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function cancelAppointmentAction(input: {
  appointmentId: string;
  reason?: string;
}): Promise<ActionResult & { offersCreated?: number }> {
  try {
    const session = await requireSession();
    const { freedSlot } = await cancelAppointment({
      appointmentId: input.appointmentId,
      reason: input.reason,
      actor: `user:${session.id}`,
    });
    let offersCreated = 0;
    if (freedSlot) {
      const offers = await createOffersForFreedSlot(freedSlot, `user:${session.id}`);
      offersCreated = offers.length;
    }
    revalidatePath("/calendar");
    return { ok: true, offersCreated };
  } catch (err) {
    return fail(err);
  }
}

export async function setAppointmentStatusAction(input: {
  appointmentId: string;
  status: AppointmentStatus;
}): Promise<ActionResult> {
  try {
    const session = await requireSession();
    if (input.status === "CANCELLED")
      return { ok: false, error: "Use the cancel action for cancellations" };
    await db.appointment.update({
      where: { id: input.appointmentId },
      data: { status: input.status, version: { increment: 1 } },
    });
    await logAudit({
      actor: `user:${session.id}`,
      action: "APPOINTMENT_STATUS_CHANGED",
      entity: "Appointment",
      entityId: input.appointmentId,
      details: { status: input.status },
    });
    revalidatePath("/calendar");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveAppointmentNotesAction(input: {
  appointmentId: string;
  notes: string;
}): Promise<ActionResult> {
  try {
    await requireSession();
    await db.appointment.update({
      where: { id: input.appointmentId },
      data: { notes: input.notes },
    });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
