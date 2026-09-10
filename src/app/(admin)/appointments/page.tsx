import Link from "next/link";
import { db } from "@/lib/db";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AppointmentFilters } from "@/components/admin/appointment-filters";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; clinic?: string; q?: string; range?: string }>;
}) {
  const params = await searchParams;
  const where: Prisma.AppointmentWhereInput = {};
  if (params.status && params.status !== "all")
    where.status = params.status as Prisma.AppointmentWhereInput["status"];
  if (params.clinic && params.clinic !== "all") where.clinicId = params.clinic;
  if (params.q) {
    where.patient = {
      OR: [
        { firstName: { contains: params.q, mode: "insensitive" } },
        { lastName: { contains: params.q, mode: "insensitive" } },
        { phone: { contains: params.q } },
      ],
    };
  }
  if (params.range === "past") where.startsAt = { lt: new Date() };
  else if (params.range !== "all") where.startsAt = { gte: new Date() };

  const [appointments, clinics] = await Promise.all([
    db.appointment.findMany({
      where,
      include: { patient: true, doctor: true, clinic: true, service: true },
      orderBy: { startsAt: params.range === "past" ? "desc" : "asc" },
      take: 100,
    }),
    db.clinic.findMany({ orderBy: { city: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Appointments" description="All bookings across the network" />
      <AppointmentFilters clinics={clinics.map((c) => ({ id: c.id, label: `${c.city} — ${c.name}` }))} />
      <Card className="mt-4">
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
                    {fmtClinic(a.startsAt, a.clinic.timezone, "d MMM yyyy HH:mm")}
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
