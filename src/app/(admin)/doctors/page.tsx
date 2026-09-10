import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { FilterBar, type FilterDef } from "@/components/admin/filter-bar";
import { resultLabel } from "@/components/admin/result-count";
import { Card, CardContent } from "@/components/ui/card";
import { languageLabel } from "@/lib/languages";
import { DoctorsTable } from "./ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const [clinics, services, specialties, allDoctors] = await Promise.all([
    db.clinic.findMany({ orderBy: { city: "asc" } }),
    db.service.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.doctor.findMany({ distinct: ["specialty"], select: { specialty: true }, orderBy: { specialty: "asc" } }),
    db.doctor.findMany({ select: { languages: true } }),
  ]);
  const languages = [...new Set(allDoctors.flatMap((d) => d.languages))].sort();

  const where: Prisma.DoctorWhereInput = {};
  const and: Prisma.DoctorWhereInput[] = [];
  if (p.q) {
    and.push({
      OR: [
        { name: { contains: p.q, mode: "insensitive" } },
        { specialty: { contains: p.q, mode: "insensitive" } },
        { bio: { contains: p.q, mode: "insensitive" } },
      ],
    });
  }
  if (p.clinic && p.clinic !== "all") and.push({ clinicId: p.clinic });
  if (p.specialty && p.specialty !== "all") and.push({ specialty: p.specialty });
  if (p.service && p.service !== "all") and.push({ services: { some: { serviceId: p.service } } });
  if (p.language && p.language !== "all") and.push({ languages: { has: p.language } });
  if (p.status === "active") and.push({ active: true });
  if (p.status === "inactive") and.push({ active: false });
  if (p.schedule === "none") and.push({ workingHours: { none: {} } });
  if (p.schedule === "weekend") and.push({ workingHours: { some: { weekday: { in: [0, 6] } } } });
  if (and.length) where.AND = and;

  const doctors = await db.doctor.findMany({
    where,
    include: { clinic: true, services: true, workingHours: true },
    orderBy: { name: "asc" },
  });

  const filters: FilterDef[] = [
    { kind: "search", key: "q", label: "Search", placeholder: "Name, specialty or bio" },
    {
      kind: "select", key: "clinic", label: "Clinic", allLabel: "All clinics", primary: true,
      options: clinics.map((c) => ({ value: c.id, label: `${c.city} — ${c.name}` })),
    },
    {
      kind: "select", key: "specialty", label: "Specialty", allLabel: "All specialties", primary: true,
      options: specialties.map((s) => ({ value: s.specialty, label: s.specialty })),
    },
    {
      kind: "select", key: "service", label: "Service", allLabel: "Any service",
      options: services.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      kind: "select", key: "language", label: "Language", allLabel: "Any language",
      options: languages.map((l) => ({ value: l, label: languageLabel(l) })),
    },
    {
      kind: "select", key: "schedule", label: "Schedule", allLabel: "Any schedule",
      options: [
        { value: "weekend", label: "Works weekends" },
        { value: "none", label: "No hours set" },
      ],
    },
    {
      kind: "select", key: "status", label: "Status", allLabel: "Any status",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Doctors"
        description="Bios and schedules — the AI recommends doctors from this data"
      />
      <FilterBar filters={filters} resultLabel={resultLabel(doctors.length)} />
      <Card className="mt-3">
        <CardContent className="pt-0">
          <DoctorsTable
            doctors={doctors.map((d) => ({
              id: d.id, name: d.name, title: d.title, specialty: d.specialty, bio: d.bio,
              languages: d.languages, color: d.color, clinicId: d.clinicId, active: d.active,
              clinicLabel: `${d.clinic.city} — ${d.clinic.name}`,
              serviceIds: d.services.map((s) => s.serviceId),
              hours: d.workingHours.map((h) => ({ weekday: h.weekday, startMin: h.startMin, endMin: h.endMin })),
            }))}
            clinics={clinics.map((c) => ({ id: c.id, label: `${c.city} — ${c.name}` }))}
            services={services.map((s) => ({ id: s.id, name: s.name }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
