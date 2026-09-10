import { db } from "@/lib/db";
import { expireOverdueOffers } from "@/lib/backfill";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BackfillToolbar, OfferRowActions } from "./ui";

export const dynamic = "force-dynamic";

export default async function BackfillPage() {
  await expireOverdueOffers();
  const offers = await db.slotOffer.findMany({
    include: {
      appointment: {
        include: { patient: true, clinic: true, service: true, doctor: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const open = offers.filter((o) => o.status === "PENDING" || o.status === "SENT");
  const closed = offers.filter((o) => o.status !== "PENDING" && o.status !== "SENT");

  return (
    <div>
      <PageHeader
        title="Slot offers (backfill)"
        description="When a slot frees up, patients with later appointments automatically get an offer to move earlier"
      >
        <BackfillToolbar />
      </PageHeader>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Open offers</CardTitle>
            <CardDescription>
              Waiting for a patient response. In demo mode the WhatsApp message is simulated — use the
              buttons to act as the patient, or open the offer link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {open.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No open offers. Cancel an upcoming appointment in the calendar to see backfill in action,
                or press &quot;Scan for freed slots&quot;.
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
                      <span className="text-muted-foreground">Current: </span>
                      {fmtClinic(o.appointment.startsAt, o.appointment.clinic.timezone)}
                      <span className="mx-2 text-muted-foreground">→</span>
                      <span className="font-medium text-primary">
                        {fmtClinic(o.proposedStartsAt, o.appointment.clinic.timezone)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      via {o.channel} · expires {fmtClinic(o.expiresAt, o.appointment.clinic.timezone, "d MMM HH:mm")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={o.status} />
                    <OfferRowActions token={o.token} />
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Message preview
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
          </CardHeader>
          <CardContent className="space-y-2">
            {closed.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            {closed.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span>
                  {o.appointment.patient.firstName} {o.appointment.patient.lastName} ·{" "}
                  {o.appointment.service.name} ·{" "}
                  <span className="text-muted-foreground">
                    proposed {fmtClinic(o.proposedStartsAt, o.appointment.clinic.timezone, "d MMM HH:mm")}
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
