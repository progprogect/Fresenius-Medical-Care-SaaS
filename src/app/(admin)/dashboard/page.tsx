import Link from "next/link";
import { AlertTriangle, CalendarDays, MessageSquare, Send } from "lucide-react";
import { db } from "@/lib/db";
import { fmtTime, fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);

  const [apptsToday, convsToday, pendingOffers, escalations, upcoming, recentAudit] =
    await Promise.all([
      db.appointment.count({
        where: { startsAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
      }),
      db.conversation.count({ where: { startedAt: { gte: dayStart } } }),
      db.slotOffer.count({ where: { status: { in: ["PENDING", "SENT"] } } }),
      db.conversation.findMany({
        where: { status: "NEEDS_HUMAN" },
        include: { patient: true, assignedTo: { select: { name: true } } },
        orderBy: [{ assignedToId: "asc" }, { startedAt: "desc" }],
        take: 5,
      }),
      db.appointment.findMany({
        where: { startsAt: { gte: now, lte: dayEnd }, status: { in: ["BOOKED", "CONFIRMED"] } },
        include: { patient: true, doctor: true, clinic: true, service: true },
        orderBy: { startsAt: "asc" },
        take: 8,
      }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

  const stats = [
    { label: "Appointments today", value: apptsToday, icon: CalendarDays, href: "/calendar" },
    { label: "AI conversations today", value: convsToday, icon: MessageSquare, href: "/conversations" },
    { label: "Open slot offers", value: pendingOffers, icon: Send, href: "/backfill" },
    { label: "Needs human", value: escalations.length, icon: AlertTriangle, href: "/conversations?status=NEEDS_HUMAN" },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Live overview of the network and the AI assistant" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="size-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{s.value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Next appointments today</CardTitle>
            <CardDescription>Across all clinics, in each clinic&apos;s local time</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing else today.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Clinic</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{fmtTime(a.startsAt, a.clinic.timezone)}</TableCell>
                      <TableCell className="font-medium">
                        {a.patient.firstName} {a.patient.lastName}
                      </TableCell>
                      <TableCell>{a.service.name}</TableCell>
                      <TableCell>{a.doctor.name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.clinic.city}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600" /> Escalations
              </CardTitle>
              <CardDescription>Conversations waiting for a human</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {escalations.length === 0 && (
                <p className="text-sm text-muted-foreground">No escalations. The assistant is handling everything.</p>
              )}
              {escalations.map((c) => (
                <Link key={c.id} href={`/conversations/${c.id}`} className="block rounded-md border p-3 transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : "Unidentified caller"}
                    </span>
                    {c.assignedTo ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{c.assignedTo.name}</span>
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-amber-700">nobody yet</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.escalationReason}</p>
                </Link>
              ))}
              {escalations.length > 0 && (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/conversations?status=NEEDS_HUMAN">View all</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Audit trail of AI and staff actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {recentAudit.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-2 text-xs">
                  <div>
                    <span className="font-medium">{log.action.toLowerCase().replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground"> — {log.actor}</span>
                  </div>
                  <span className="shrink-0 text-muted-foreground">
                    {fmtClinic(log.createdAt, "Europe/Berlin", "d MMM HH:mm")}
                  </span>
                </div>
              ))}
              {recentAudit.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
