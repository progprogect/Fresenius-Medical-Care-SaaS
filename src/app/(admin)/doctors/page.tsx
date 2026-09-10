import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DoctorsTable } from "./ui";

export const dynamic = "force-dynamic";

export default async function DoctorsPage() {
  const [doctors, clinics, services] = await Promise.all([
    db.doctor.findMany({
      include: { clinic: true, services: true, workingHours: true },
      orderBy: { name: "asc" },
    }),
    db.clinic.findMany({ orderBy: { city: "asc" } }),
    db.service.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Doctors"
        description="Bios and schedules — the AI recommends doctors based on this data"
      />
      <Card>
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
