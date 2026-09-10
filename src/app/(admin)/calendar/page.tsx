import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { CalendarView } from "@/components/admin/calendar/calendar-view";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [clinics, doctors, services, patients] = await Promise.all([
    db.clinic.findMany({ where: { active: true }, orderBy: { city: "asc" } }),
    db.doctor.findMany({
      where: { active: true },
      include: { services: true },
      orderBy: { name: "asc" },
    }),
    db.service.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.patient.findMany({ orderBy: { lastName: "asc" } }),
  ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Calendar"
        description="Appointment book per clinic — click a visit to manage it"
      />
      <CalendarView
        clinics={clinics.map((c) => ({ id: c.id, name: c.name, city: c.city, timezone: c.timezone }))}
        doctors={doctors.map((d) => ({
          id: d.id,
          name: `${d.title} ${d.name}`,
          color: d.color,
          clinicId: d.clinicId,
          serviceIds: d.services.map((s) => s.serviceId),
        }))}
        services={services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin }))}
        patients={patients.map((p) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`,
          phone: p.phone,
        }))}
      />
    </div>
  );
}
