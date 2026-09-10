import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { sendPatientMessage } from "@/lib/notify";
import { rescheduleAppointment, SchedulingError } from "@/lib/scheduling";
import { fmtClinic } from "@/lib/format";
import { nanoid } from "nanoid";

export type FreedSlot = {
  doctorId: string;
  clinicId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
};

/**
 * A slot was freed (cancellation or reschedule). Find patients with a LATER
 * appointment for the same service in the same clinic and offer them the
 * earlier slot. First accept wins; sibling offers get superseded.
 */
export async function createOffersForFreedSlot(slot: FreedSlot, actor: string) {
  const cfg = await getSettings("backfill");
  if (!cfg.enabled) return [];
  if (slot.startsAt <= new Date()) return [];

  const horizonEnd = new Date(Date.now() + cfg.horizonDays * 24 * 60 * 60 * 1000);

  // Doctors in this clinic able to perform the service (alternative provider rule)
  const capableDoctors = await db.doctor.findMany({
    where: { clinicId: slot.clinicId, active: true, services: { some: { serviceId: slot.serviceId } } },
    select: { id: true },
  });
  const capableIds = capableDoctors.map((d) => d.id);
  const proposedDoctorId = capableIds.includes(slot.doctorId) ? slot.doctorId : capableIds[0];
  if (!proposedDoctorId) return [];

  const candidates = await db.appointment.findMany({
    where: {
      clinicId: slot.clinicId,
      serviceId: slot.serviceId,
      status: { in: ["BOOKED", "CONFIRMED"] },
      startsAt: { gt: slot.endsAt, lte: horizonEnd },
      patient: { whatsappOptIn: true },
      // don't spam: skip appointments that already have a pending offer
      slotOffers: { none: { status: { in: ["PENDING", "SENT"] } } },
    },
    include: { patient: true, clinic: true, service: true },
    orderBy: { startsAt: "asc" },
    take: cfg.maxOffersPerSlot,
  });
  if (candidates.length === 0) return [];

  const clinic = candidates[0].clinic;
  const service = candidates[0].service;
  const expiresAt = new Date(Date.now() + cfg.offerTtlMinutes * 60_000);
  const channel = cfg.channels[0] ?? "whatsapp";
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

  const created = [];
  for (const appt of candidates) {
    const token = nanoid(24);
    const when = fmtClinic(slot.startsAt, clinic.timezone);
    const body =
      `Hello ${appt.patient.firstName}! An earlier slot just opened at ${clinic.name} (${clinic.city}) ` +
      `for your ${service.name}: ${when}. ` +
      `Your current visit is ${fmtClinic(appt.startsAt, clinic.timezone)}. ` +
      `Tap to move your appointment: ${baseUrl}/offer/${token} ` +
      `(offer expires in ${cfg.offerTtlMinutes} min)`;

    const offer = await db.slotOffer.create({
      data: {
        appointmentId: appt.id,
        proposedStartsAt: slot.startsAt,
        proposedEndsAt: new Date(slot.startsAt.getTime() + service.durationMin * 60_000),
        proposedDoctorId,
        channel,
        token,
        expiresAt,
        messagePreview: body,
      },
    });

    const result = await sendPatientMessage({ to: appt.patient.phone, body, channel });
    await db.slotOffer.update({
      where: { id: offer.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        channel: result.simulated ? `${channel} (demo)` : channel,
      },
    });
    await logAudit({
      actor,
      action: "OFFER_SENT",
      entity: "SlotOffer",
      entityId: offer.id,
      details: { appointmentId: appt.id, to: appt.patient.phone, simulated: result.simulated },
    });
    created.push(offer);
  }
  return created;
}

export async function acceptOffer(token: string, actor: string) {
  const offer = await db.slotOffer.findUnique({
    where: { token },
    include: { appointment: { include: { patient: true, service: true, clinic: true } } },
  });
  if (!offer) throw new SchedulingError("OFFER_NOT_FOUND", "This offer link is invalid.");
  if (offer.status === "ACCEPTED") return offer; // idempotent
  if (offer.status !== "PENDING" && offer.status !== "SENT")
    throw new SchedulingError("OFFER_CLOSED", "This offer is no longer active.");
  if (offer.expiresAt < new Date()) {
    await db.slotOffer.update({ where: { id: offer.id }, data: { status: "EXPIRED" } });
    throw new SchedulingError("OFFER_EXPIRED", "This offer has expired.");
  }

  const { updated } = await rescheduleAppointment({
    appointmentId: offer.appointmentId,
    newStartsAt: offer.proposedStartsAt,
    newDoctorId: offer.proposedDoctorId,
    actor,
    source: "BACKFILL",
  });

  const accepted = await db.slotOffer.update({
    where: { id: offer.id },
    data: { status: "ACCEPTED", respondedAt: new Date() },
  });

  // Supersede sibling offers competing for the same freed slot
  await db.slotOffer.updateMany({
    where: {
      id: { not: offer.id },
      proposedStartsAt: offer.proposedStartsAt,
      proposedDoctorId: offer.proposedDoctorId,
      status: { in: ["PENDING", "SENT"] },
    },
    data: { status: "SUPERSEDED", respondedAt: new Date() },
  });

  await logAudit({
    actor,
    action: "OFFER_ACCEPTED",
    entity: "SlotOffer",
    entityId: offer.id,
    details: { appointmentId: offer.appointmentId, movedTo: offer.proposedStartsAt.toISOString() },
  });

  return { ...accepted, appointment: updated };
}

export async function declineOffer(token: string, actor: string) {
  const offer = await db.slotOffer.findUnique({ where: { token } });
  if (!offer) throw new SchedulingError("OFFER_NOT_FOUND", "This offer link is invalid.");
  if (offer.status !== "PENDING" && offer.status !== "SENT") return offer;
  const updated = await db.slotOffer.update({
    where: { id: offer.id },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  await logAudit({
    actor,
    action: "OFFER_DECLINED",
    entity: "SlotOffer",
    entityId: offer.id,
  });
  return updated;
}

/** Lazily expire overdue offers; returns count. */
export async function expireOverdueOffers() {
  const res = await db.slotOffer.updateMany({
    where: { status: { in: ["PENDING", "SENT"] }, expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}

/**
 * Manual/periodic scan: find future slots freed by recent cancellations that
 * are still empty and create offers for them.
 */
export async function scanForBackfill(actor: string) {
  await expireOverdueOffers();
  const recentCancellations = await db.appointment.findMany({
    where: {
      status: "CANCELLED",
      startsAt: { gt: new Date() },
      cancelledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  let createdTotal = 0;
  for (const c of recentCancellations) {
    // is the slot still free for that doctor?
    const clash = await db.appointment.findFirst({
      where: {
        doctorId: c.doctorId,
        status: { notIn: ["CANCELLED"] },
        startsAt: { lt: c.endsAt },
        endsAt: { gt: c.startsAt },
      },
      select: { id: true },
    });
    if (clash) continue;
    // already offered and still open?
    const open = await db.slotOffer.findFirst({
      where: {
        proposedStartsAt: c.startsAt,
        proposedDoctorId: c.doctorId,
        status: { in: ["PENDING", "SENT"] },
      },
      select: { id: true },
    });
    if (open) continue;
    const created = await createOffersForFreedSlot(
      {
        doctorId: c.doctorId,
        clinicId: c.clinicId,
        serviceId: c.serviceId,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
      },
      actor
    );
    createdTotal += created.length;
  }
  return createdTotal;
}
