import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ClinicsTable } from "./ui";

export const dynamic = "force-dynamic";

export default async function ClinicsPage() {
  const clinics = await db.clinic.findMany({
    include: { _count: { select: { doctors: true, appointments: true } } },
    orderBy: [{ country: "asc" }, { city: "asc" }],
  });
  return (
    <div>
      <PageHeader
        title="Clinics"
        description="Locations across Europe — the AI uses this list to route patients"
      />
      <Card>
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
