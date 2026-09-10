import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  const clinicId = url.searchParams.get("clinicId") || undefined;
  const doctorId = url.searchParams.get("doctorId") || undefined;
  if (isNaN(from.getTime()) || isNaN(to.getTime()))
    return NextResponse.json({ error: "from/to required" }, { status: 400 });

  const appointments = await db.appointment.findMany({
    where: {
      startsAt: { lt: to },
      endsAt: { gt: from },
      ...(clinicId ? { clinicId } : {}),
      ...(doctorId ? { doctorId } : {}),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      doctor: { select: { id: true, name: true, title: true, color: true } },
      service: { select: { id: true, name: true, durationMin: true } },
      clinic: { select: { id: true, name: true, city: true, timezone: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  return NextResponse.json({ appointments });
}
