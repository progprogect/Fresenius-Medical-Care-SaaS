import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ServicesTable } from "./ui";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const services = await db.service.findMany({
    include: { _count: { select: { doctors: true } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return (
    <div>
      <PageHeader
        title="Services"
        description="The procedure catalog the AI offers to patients"
      />
      <Card>
        <CardContent className="pt-0">
          <ServicesTable
            services={services.map((s) => ({
              id: s.id, name: s.name, category: s.category, durationMin: s.durationMin,
              priceEur: s.price / 100, description: s.description,
              prepInstructions: s.prepInstructions, active: s.active, doctors: s._count.doctors,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
