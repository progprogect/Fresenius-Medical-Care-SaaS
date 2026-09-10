import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { FilterBar, type FilterDef } from "@/components/admin/filter-bar";
import { resultLabel } from "@/components/admin/result-count";
import { Card, CardContent } from "@/components/ui/card";
import { ServicesTable } from "./ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const categories = await db.service.findMany({
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });

  const where: Prisma.ServiceWhereInput = {};
  const and: Prisma.ServiceWhereInput[] = [];
  if (p.q) {
    and.push({
      OR: [
        { name: { contains: p.q, mode: "insensitive" } },
        { description: { contains: p.q, mode: "insensitive" } },
        { category: { contains: p.q, mode: "insensitive" } },
      ],
    });
  }
  if (p.category && p.category !== "all") and.push({ category: p.category });
  if (p.status === "active") and.push({ active: true });
  if (p.status === "inactive") and.push({ active: false });
  if (p.duration === "short") and.push({ durationMin: { lte: 30 } });
  if (p.duration === "medium") and.push({ durationMin: { gt: 30, lte: 60 } });
  if (p.duration === "long") and.push({ durationMin: { gt: 60 } });
  if (p.staffed === "yes") and.push({ doctors: { some: {} } });
  if (p.staffed === "no") and.push({ doctors: { none: {} } });
  if (and.length) where.AND = and;

  const orderBy: Prisma.ServiceOrderByWithRelationInput[] =
    p.sort === "price" ? [{ price: "desc" }] :
    p.sort === "duration" ? [{ durationMin: "desc" }] :
    [{ category: "asc" }, { name: "asc" }];

  const services = await db.service.findMany({
    where,
    include: { _count: { select: { doctors: true, appointments: true } } },
    orderBy,
  });

  const filters: FilterDef[] = [
    { kind: "search", key: "q", label: "Search", placeholder: "Service or description" },
    {
      kind: "select", key: "category", label: "Category", allLabel: "All categories", primary: true,
      options: categories.map((c) => ({ value: c.category, label: c.category })),
    },
    {
      kind: "select", key: "duration", label: "Duration", allLabel: "Any duration",
      options: [
        { value: "short", label: "Up to 30 min" },
        { value: "medium", label: "31–60 min" },
        { value: "long", label: "Over 60 min" },
      ],
    },
    {
      kind: "select", key: "status", label: "Status", allLabel: "Any status",
      options: [
        { value: "active", label: "Bookable" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    {
      kind: "select", key: "staffed", label: "Coverage", allLabel: "Any coverage",
      options: [
        { value: "yes", label: "Has doctors" },
        { value: "no", label: "No doctors assigned" },
      ],
    },
    {
      kind: "sort", key: "sort", label: "Sort", defaultLabel: "Category",
      options: [
        { value: "price", label: "Price (high–low)" },
        { value: "duration", label: "Duration (long–short)" },
      ],
    },
  ];

  return (
    <div>
      <PageHeader title="Services" description="The procedure catalog the AI offers to patients" />
      <FilterBar filters={filters} resultLabel={resultLabel(services.length)} />
      <Card className="mt-3">
        <CardContent className="pt-0">
          <ServicesTable
            services={services.map((s) => ({
              id: s.id, name: s.name, category: s.category, durationMin: s.durationMin,
              priceEur: s.price / 100, description: s.description,
              prepInstructions: s.prepInstructions, active: s.active,
              doctors: s._count.doctors, appointments: s._count.appointments,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
