import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      appointments: {
        include: { clinic: true, doctor: true, service: true },
        orderBy: { startsAt: "desc" },
        take: 30,
      },
      conversations: { orderBy: { startedAt: "desc" }, take: 10 },
    },
  });
  if (!patient) notFound();

  return (
    <div>
      <PageHeader
        title={`${patient.firstName} ${patient.lastName}`}
        description="Patient profile, appointment history and AI conversations"
      />
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Phone: </span><span className="font-mono">{patient.phone}</span></div>
            <div><span className="text-muted-foreground">Email: </span>{patient.email ?? "—"}</div>
            <div>
              <span className="text-muted-foreground">Date of birth: </span>
              {patient.dateOfBirth ? formatInTimeZone(patient.dateOfBirth, "UTC", "d MMM yyyy") : "—"}
            </div>
            <div><span className="text-muted-foreground">Language: </span>{patient.language.toUpperCase()}</div>
            <div><span className="text-muted-foreground">WhatsApp offers: </span>{patient.whatsappOptIn ? "opted in" : "opted out"}</div>
            {patient.notes && (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{patient.notes}</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Appointments</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When (local)</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Clinic</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patient.appointments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {fmtClinic(a.startsAt, a.clinic.timezone, "d MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell>{a.service.name}</TableCell>
                      <TableCell>{a.doctor.name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.clinic.city}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                    </TableRow>
                  ))}
                  {patient.appointments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        No appointments yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>AI conversations</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {patient.conversations.map((c) => (
                <Link
                  key={c.id}
                  href={`/conversations/${c.id}`}
                  className="flex items-center justify-between rounded-md border p-3 text-sm transition-colors hover:border-primary/40"
                >
                  <span>
                    {c.channel.toLowerCase().replace(/_/g, " ")} ·{" "}
                    {fmtClinic(c.startedAt, "Europe/Berlin", "d MMM HH:mm")}
                  </span>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
              {patient.conversations.length === 0 && (
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
