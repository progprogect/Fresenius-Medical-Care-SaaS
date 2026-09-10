import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findAvailableSlots, SchedulingError } from "@/lib/scheduling";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  if (!serviceId) return NextResponse.json({ error: "serviceId required" }, { status: 400 });
  try {
    const slots = await findAvailableSlots({
      serviceId,
      clinicId: url.searchParams.get("clinicId") || undefined,
      doctorId: url.searchParams.get("doctorId") || undefined,
      fromDate: url.searchParams.get("fromDate")
        ? new Date(`${url.searchParams.get("fromDate")}T00:00:00Z`)
        : undefined,
      days: Number(url.searchParams.get("days") ?? 7),
      excludeAppointmentId: url.searchParams.get("excludeAppointmentId") || undefined,
      limit: 60,
    });
    return NextResponse.json({ slots });
  } catch (err) {
    if (err instanceof SchedulingError)
      return NextResponse.json({ error: err.code, message: err.message }, { status: 400 });
    throw err;
  }
}
