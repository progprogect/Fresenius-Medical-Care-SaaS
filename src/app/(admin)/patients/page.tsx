import Link from "next/link";
import { db } from "@/lib/db";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { FilterBar, type FilterDef } from "@/components/admin/filter-bar";
import { resultLabel } from "@/components/admin/result-count";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const LIMIT = 200;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const now = new Date();
  const clinics = await db.clinic.findMany({ orderBy: { city: "asc" } });

  const where: Prisma.PatientWhereInput = {};
  const and: Prisma.PatientWhereInput[] = [];

  if (p.q) {
    and.push({
      OR: [
        { firstName: { contains: p.q, mode: "insensitive" } },
        { lastName: { contains: p.q, mode: "insensitive" } },
        { phone: { contains: p.q } },
        { email: { contains: p.q, mode: "insensitive" } },
      ],
    });
  }
  if (p.language && p.language !== "all") and.push({ language: p.language });
  if (p.optIn === "yes") and.push({ whatsappOptIn: true });
  if (p.optIn === "no") and.push({ whatsappOptIn: false });
  if (p.clinic && p.clinic !== "all")
    and.push({ appointments: { some: { clinicId: p.clinic } } });
  if (p.visits === "upcoming")
    and.push({
      appointments: { some: { startsAt: { gte: now }, status: { in: ["BOOKED", "CONFIRMED"] } } },
    });
  if (p.visits === "none") and.push({ appointments: { none: {} } });
  if (p.visits === "past_only")
    and.push({
      appointments: { some: {} },
      NOT: { appointments: { some: { startsAt: { gte: now }, status: { in: ["BOOKED", "CONFIRMED"] } } } },
    });
  if (and.length) where.AND = and;

  const orderBy: Prisma.PatientOrderByWithRelationInput =
    p.sort === "newest" ? { createdAt: "desc" } : { lastName: "asc" };

  const patients = await db.patient.findMany({
    where,
    include: {
      appointments: {
        where: { startsAt: { gte: now }, status: { in: ["BOOKED", "CONFIRMED"] } },
        orderBy: { startsAt: "asc" },
        take: 1,
        include: { clinic: true, service: true },
      },
      _count: { select: { appointments: true, conversations: true } },
    },
    orderBy,
    take: LIMIT,
  });

  const filters: FilterDef[] = [
    { kind: "search", key: "q", label: "Search", placeholder: "Name, phone or email" },
    {
      kind: "select", key: "visits", label: "Visits", allLabel: "Any visit history", primary: true,
      options: [
        { value: "upcoming", label: "Has upcoming visit" },
        { value: "past_only", label: "Past visits only" },
        { value: "none", label: "Never booked" },
      ],
    },
    {
      kind: "select", key: "clinic", label: "Clinic", allLabel: "Any clinic",
      options: clinics.map((c) => ({ value: c.id, label: `${c.city} — ${c.name}` })),
    },
    {
      kind: "select", key: "language", label: "Language", allLabel: "Any language",
      options: [
        { value: "en", label: "English" }, { value: "de", label: "German" },
        { value: "fr", label: "French" }, { value: "es", label: "Spanish" },
        { value: "it", label: "Italian" }, { value: "pl", label: "Polish" },
      ],
    },
    {
      kind: "select", key: "optIn", label: "Slot offers", allLabel: "Any offer opt-in",
      options: [
        { value: "yes", label: "Accepts offers" },
        { value: "no", label: "Opted out" },
      ],
    },
    {
      kind: "sort", key: "sort", label: "Sort", defaultLabel: "Name (A–Z)",
      options: [{ value: "newest", label: "Newest first" }],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Patient registry the AI uses for identity verification"
      />
      <FilterBar filters={filters} resultLabel={resultLabel(patients.length, LIMIT)} />
      <Card className="mt-3">
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Offers</TableHead>
                <TableHead>Next visit</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Chats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((pt) => (
                <TableRow key={pt.id}>
                  <TableCell className="font-medium">
                    <Link href={`/patients/${pt.id}`} className="hover:underline">
                      {pt.firstName} {pt.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{pt.phone}</TableCell>
                  <TableCell className="text-xs uppercase text-muted-foreground">{pt.language}</TableCell>
                  <TableCell>
                    <Badge variant={pt.whatsappOptIn ? "secondary" : "outline"} className="font-normal">
                      {pt.whatsappOptIn ? "opted in" : "opted out"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {pt.appointments[0] ? (
                      `${fmtClinic(pt.appointments[0].startsAt, pt.appointments[0].clinic.timezone, "d MMM HH:mm")} · ${pt.appointments[0].service.name}`
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{pt._count.appointments}</TableCell>
                  <TableCell className="text-right">{pt._count.conversations}</TableCell>
                </TableRow>
              ))}
              {patients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No patients match the filters.
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
