import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { FilterBar, type FilterDef } from "@/components/admin/filter-bar";
import { ResultCount } from "@/components/admin/result-count";
import { Card, CardContent } from "@/components/ui/card";
import { ClinicsTable } from "./ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ClinicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const countries = await db.clinic.findMany({
    distinct: ["country"],
    select: { country: true },
    orderBy: { country: "asc" },
  });

  const where: Prisma.ClinicWhereInput = {};
  const and: Prisma.ClinicWhereInput[] = [];
  if (p.q) {
    and.push({
      OR: [
        { name: { contains: p.q, mode: "insensitive" } },
        { city: { contains: p.q, mode: "insensitive" } },
        { address: { contains: p.q, mode: "insensitive" } },
        { phone: { contains: p.q } },
      ],
    });
  }
  if (p.country && p.country !== "all") and.push({ country: p.country });
  if (p.status === "active") and.push({ active: true });
  if (p.status === "inactive") and.push({ active: false });
  if (p.staffed === "yes") and.push({ doctors: { some: { active: true } } });
  if (p.staffed === "no") and.push({ doctors: { none: { active: true } } });
  if (and.length) where.AND = and;

  const clinics = await db.clinic.findMany({
    where,
    include: { _count: { select: { doctors: true, appointments: true } } },
    orderBy: [{ country: "asc" }, { city: "asc" }],
  });

  const filters: FilterDef[] = [
    { kind: "search", key: "q", placeholder: "Name, city, address or phone...", width: "w-64" },
    {
      kind: "select", key: "country", allLabel: "All countries", width: "w-44",
      options: countries.map((c) => ({ value: c.country, label: c.country })),
    },
    {
      kind: "select", key: "status", allLabel: "Any status", width: "w-40",
      options: [
        { value: "active", label: "Accepting bookings" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    {
      kind: "select", key: "staffed", allLabel: "Any staffing", width: "w-44",
      options: [
        { value: "yes", label: "Has active doctors" },
        { value: "no", label: "No active doctors" },
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Clinics"
        description="Locations across Europe — the AI routes patients using this list"
      />
      <FilterBar filters={filters} />
      <ResultCount shown={clinics.length} />
      <Card className="mt-3">
        <CardContent className="pt-0">
          <ClinicsTable
            clinics={clinics.map((c) => ({
              id: c.id, name: c.name, city: c.city, country: c.country,
              address: c.address, phone: c.phone, timezone: c.timezone,
              active: c.active, doctors: c._count.doctors, appointments: c._count.appointments,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
