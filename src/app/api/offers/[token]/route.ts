import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acceptOffer, declineOffer } from "@/lib/backfill";
import { SchedulingError } from "@/lib/scheduling";
import { fmtClinic } from "@/lib/format";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const offer = await db.slotOffer.findUnique({
    where: { token },
    include: {
      appointment: { include: { patient: true, clinic: true, service: true, doctor: true } },
    },
  });
  if (!offer) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const doctor = await db.doctor.findUnique({ where: { id: offer.proposedDoctorId } });
  const tz = offer.appointment.clinic.timezone;
  return NextResponse.json({
    status: offer.status,
    expired: offer.expiresAt < new Date() && ["PENDING", "SENT"].includes(offer.status),
    patientFirstName: offer.appointment.patient.firstName,
    service: offer.appointment.service.name,
    clinic: `${offer.appointment.clinic.name}, ${offer.appointment.clinic.city}`,
    currentWhen: fmtClinic(offer.appointment.startsAt, tz),
    proposedWhen: fmtClinic(offer.proposedStartsAt, tz),
    proposedDoctor: doctor ? `${doctor.title} ${doctor.name}` : "",
    expiresAt: offer.expiresAt.toISOString(),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === "decline") {
      await declineOffer(token, "patient:offer-link");
      return NextResponse.json({ ok: true, status: "DECLINED" });
    }
    const accepted = await acceptOffer(token, "patient:offer-link");
    return NextResponse.json({ ok: true, status: "ACCEPTED", offer: { id: accepted.id } });
  } catch (err) {
    if (err instanceof SchedulingError)
      return NextResponse.json({ ok: false, error: err.code, message: err.message }, { status: 409 });
    console.error("offer action failed", err);
    return NextResponse.json({ ok: false, error: "INTERNAL" }, { status: 500 });
  }
}
