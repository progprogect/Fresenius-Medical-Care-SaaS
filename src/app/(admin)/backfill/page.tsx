import { CalendarX2, Send, CalendarCheck2, Info } from "lucide-react";
import { db } from "@/lib/db";
import { expireOverdueOffers } from "@/lib/backfill";
import { getSettings } from "@/lib/settings";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackfillToolbar, OfferRowActions } from "./ui";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: CalendarX2,
    title: "1. A slot frees up",
    text: "A patient cancels or moves a visit, leaving a gap in a doctor's day that would otherwise go unused.",
  },
  {
    icon: Send,
    title: "2. We offer it to waiting patients",
    text: "Patients booked LATER for the same service at the same clinic get a WhatsApp message with a one-tap link to take the earlier time.",
  },
  {
    icon: CalendarCheck2,
    title: "3. First to accept gets it",
    text: "The first tap moves that patient's appointment automatically. Competing offers close themselves, so the slot can never be double-booked.",
  },
];

export default async function BackfillPage() {
  await expireOverdueOffers();
  const [offers, cfg] = await Promise.all([
    db.slotOffer.findMany({
      include: {
        appointment: { include: { patient: true, clinic: true, service: true, doctor: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    getSettings("backfill"),
  ]);

  const open = offers.filter((o) => o.status === "PENDING" || o.status === "SENT");
  const closed = offers.filter((o) => o.status !== "PENDING" && o.status !== "SENT");
  const accepted = closed.filter((o) => o.status === "ACCEPTED").length;

  return (
    <div>
      <PageHeader
        title="Slot offers"
        description="Automatically filling gaps left by cancellations, so freed appointment times do not go to waste"
      >
        <BackfillToolbar />
      </PageHeader>

      <Card className="mb-6 border-primary/25 bg-primary/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="size-4 text-primary" />
            What a slot offer is
          </CardTitle>
          <CardDescription>
            An invitation sent to a patient to move their appointment <strong>earlier</strong>, into a
            time another patient just gave up. It recovers revenue from cancellations and shortens
            waiting times without anyone at the front desk making calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.title} className="rounded-lg border bg-background p-3">
                <s.icon className="mb-1.5 size-4 text-primary" />
                <div className="text-sm font-medium">{s.title}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Status: <strong className="text-foreground">{cfg.enabled ? "enabled" : "disabled"}</strong>
            </span>
            <span>Looks up to {cfg.horizonDays} days ahead for candidates</span>
            <span>Each offer expires after {cfg.offerTtlMinutes} min</span>
            <span>At most {cfg.maxOffersPerSlot} patients per freed slot</span>
            <span>{accepted} accepted so far</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Open offers
              {open.length > 0 && <Badge variant="secondary">{open.length}</Badge>}
            </CardTitle>
            <CardDescription>
              Sent and waiting for the patient to answer. Twilio is in demo mode, so the WhatsApp
              message is simulated — use the buttons to answer as the patient would.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {open.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing waiting. Cancel an upcoming visit in the calendar to see this in action, or
                press &quot;Scan for freed slots&quot; to sweep recent cancellations.
              </p>
            )}
            {open.map((o) => (
              <div key={o.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {o.appointment.patient.firstName} {o.appointment.patient.lastName}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {o.appointment.service.name} · {o.appointment.clinic.city}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="text-muted-foreground">Booked for: </span>
                      {fmtClinic(o.appointment.startsAt, o.appointment.clinic.timezone)}
                      <span className="mx-2 text-muted-foreground">→ offered instead:</span>
                      <span className="font-medium text-primary">
                        {fmtClinic(o.proposedStartsAt, o.appointment.clinic.timezone)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      sent via {o.channel} · expires{" "}
                      {fmtClinic(o.expiresAt, o.appointment.clinic.timezone, "d MMM HH:mm")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={o.status} />
                    <OfferRowActions token={o.token} />
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Message the patient received
                  </summary>
                  <p className="mt-1 rounded-md bg-muted p-2 text-xs">{o.messagePreview}</p>
                </details>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>
              accepted = the patient moved earlier · declined = they kept their time · expired = no
              answer in time · superseded = someone else took the slot first
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {closed.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            {closed.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  {o.appointment.patient.firstName} {o.appointment.patient.lastName} ·{" "}
                  {o.appointment.service.name} ·{" "}
                  <span className="text-muted-foreground">
                    offered {fmtClinic(o.proposedStartsAt, o.appointment.clinic.timezone, "d MMM HH:mm")}
                  </span>
                </span>
                <StatusBadge status={o.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
