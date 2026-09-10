import Link from "next/link";
import { db } from "@/lib/db";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { FilterBar, type FilterDef } from "@/components/admin/filter-bar";
import { ResultCount } from "@/components/admin/result-count";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const LIMIT = 200;

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const now = new Date();
  const [clinics, doctors, services] = await Promise.all([
    db.clinic.findMany({ orderBy: { city: "asc" } }),
    db.doctor.findMany({ orderBy: { name: "asc" }, include: { clinic: true } }),
    db.service.findMany({ orderBy: { name: "asc" } }),
  ]);

  const where: Prisma.AppointmentWhereInput = {};
  const and: Prisma.AppointmentWhereInput[] = [];

  if (p.status && p.status !== "all") where.status = p.status as Prisma.AppointmentWhereInput["status"];
  if (p.clinic && p.clinic !== "all") where.clinicId = p.clinic;
  if (p.doctor && p.doctor !== "all") where.doctorId = p.doctor;
  if (p.service && p.service !== "all") where.serviceId = p.service;
  if (p.source && p.source !== "all") where.source = p.source as Prisma.AppointmentWhereInput["source"];
  if (p.q) {
    where.patient = {
      OR: [
        { firstName: { contains: p.q, mode: "insensitive" } },
        { lastName: { contains: p.q, mode: "insensitive" } },
        { phone: { contains: p.q } },
      ],
    };
  }

  // Explicit date bounds win over the coarse range preset.
  const from = p.from ? new Date(`${p.from}T00:00:00`) : null;
  const to = p.to ? new Date(`${p.to}T23:59:59`) : null;
  if (from) and.push({ startsAt: { gte: from } });
  if (to) and.push({ startsAt: { lte: to } });
  if (!from && !to) {
    if (p.range === "past") and.push({ startsAt: { lt: now } });
    else if (p.range === "today") {
      const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
      and.push({ startsAt: { gte: dayStart, lte: dayEnd } });
    } else if (p.range === "week") {
      and.push({ startsAt: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) } });
    } else if (p.range !== "all") and.push({ startsAt: { gte: now } });
  }
  if (and.length) where.AND = and;

  const descending = p.range === "past" || (!!to && !from);
  const appointments = await db.appointment.findMany({
    where,
    include: { patient: true, doctor: true, clinic: true, service: true },
    orderBy: { startsAt: descending ? "desc" : "asc" },
    take: LIMIT,
  });

  const filters: FilterDef[] = [
    { kind: "search", key: "q", placeholder: "Patient name or phone...", width: "w-56" },
    {
      kind: "select", key: "range", allLabel: "All time", width: "w-36",
      options: [
        { value: "upcoming", label: "Upcoming" },
        { value: "today", label: "Today" },
        { value: "week", label: "Next 7 days" },
        { value: "past", label: "Past" },
      ],
    },
    { kind: "date", key: "from", label: "from", width: "w-38" },
    { kind: "date", key: "to", label: "to", width: "w-38" },
    {
      kind: "select", key: "status", allLabel: "All statuses", width: "w-40",
      options: [
        { value: "BOOKED", label: "Booked" },
        { value: "CONFIRMED", label: "Confirmed" },
        { value: "COMPLETED", label: "Completed" },
        { value: "CANCELLED", label: "Cancelled" },
        { value: "NO_SHOW", label: "No-show" },
      ],
    },
    {
      kind: "select", key: "clinic", allLabel: "All clinics", width: "w-52",
      options: clinics.map((c) => ({ value: c.id, label: `${c.city} — ${c.name}` })),
    },
    {
      kind: "select", key: "doctor", allLabel: "All doctors", width: "w-48",
      options: doctors.map((d) => ({ value: d.id, label: `${d.name} (${d.clinic.city})` })),
    },
    {
      kind: "select", key: "service", allLabel: "All services", width: "w-52",
      options: services.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      kind: "select", key: "source", allLabel: "Any source", width: "w-44",
      options: [
        { value: "WIDGET_CHAT", label: "Widget chat" },
        { value: "WIDGET_VOICE", label: "Widget voice" },
        { value: "PHONE", label: "Phone" },
        { value: "WHATSAPP", label: "WhatsApp" },
        { value: "MANUAL", label: "Staff (manual)" },
        { value: "BACKFILL", label: "Slot offer" },
      ],
    },
  ];

  return (
    <div>
      <PageHeader title="Appointments" description="All bookings across the network" />
      <FilterBar filters={filters} />
      <ResultCount shown={appointments.length} capped={LIMIT} />
      <Card className="mt-3">
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When (local)</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Clinic</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {fmtClinic(a.startsAt, a.clinic.timezone, "EEE d MMM yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/patients/${a.patient.id}`} className="hover:underline">
                      {a.patient.firstName} {a.patient.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{a.service.name}</TableCell>
                  <TableCell>{a.doctor.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.clinic.city}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.source.toLowerCase().replace(/_/g, " ")}
                  </TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                </TableRow>
              ))}
              {appointments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No appointments match the filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
