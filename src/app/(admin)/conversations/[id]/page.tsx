import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimButton, ReleaseButton, ResolveButton } from "../escalation-actions";
import { cn } from "@/lib/utils";
import { languageLabel } from "@/lib/languages";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const conv = await db.conversation.findUnique({
    where: { id },
    include: {
      patient: true,
      assignedTo: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conv) notFound();
  const mine = conv.assignedToId === session.id;

  return (
    <div>
      <PageHeader
        title={`Conversation · ${conv.channel.toLowerCase().replace(/_/g, " ")}`}
        description={`Started ${fmtClinic(conv.startedAt, "Europe/Berlin")}`}
      >
        <StatusBadge status={conv.status} className="text-xs" />
        {conv.status === "NEEDS_HUMAN" && !conv.assignedToId && (
          <ClaimButton conversationId={conv.id} label="Take this over" size="default" />
        )}
        {conv.status === "NEEDS_HUMAN" && mine && (
          <>
            <ResolveButton conversationId={conv.id} />
            <ReleaseButton conversationId={conv.id} />
          </>
        )}
      </PageHeader>

      {conv.status === "NEEDS_HUMAN" && (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">
              The assistant handed this conversation to a human
            </p>
            {conv.escalationReason && (
              <p className="mt-0.5 text-sm text-amber-800">{conv.escalationReason}</p>
            )}
            <p className="mt-1 text-xs text-amber-800/80">
              {conv.assignedTo
                ? mine
                  ? "You are handling this. Mark it handled once the patient has been helped."
                  : `${conv.assignedTo.name} is handling this.`
                : "Nobody has taken it yet."}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader><CardTitle>Transcript</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {conv.messages.map((m) => {
              if (m.role === "TOOL")
                return (
                  <div key={m.id} className="mx-auto max-w-xl rounded-md border border-dashed bg-muted/40 px-3 py-1.5 text-center text-[11px] text-muted-foreground">
                    tool <span className="font-mono">{m.toolName}</span> → {m.content.slice(0, 160)}
                    {m.content.length > 160 ? "…" : ""}
                  </div>
                );
              const isUser = m.role === "USER";
              return (
                <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                      isUser ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    {m.content}
                    <div className={cn("mt-1 text-[10px]", isUser ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {fmtClinic(m.createdAt, "Europe/Berlin", "HH:mm:ss")}
                    </div>
                  </div>
                </div>
              );
            })}
            {conv.messages.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No messages.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Patient: </span>
                {conv.patient ? (
                  <Link href={`/patients/${conv.patient.id}`} className="font-medium hover:underline">
                    {conv.patient.firstName} {conv.patient.lastName}
                  </Link>
                ) : (
                  "not identified"
                )}
              </div>
              <div><span className="text-muted-foreground">Verified: </span>{conv.verified ? "yes" : "no"}</div>
              <div>
                <span className="text-muted-foreground">Language: </span>
                {conv.language ? languageLabel(conv.language) : "not detected"}
              </div>
              <div><span className="text-muted-foreground">Channel: </span>{conv.channel.toLowerCase().replace(/_/g, " ")}</div>
              {conv.externalId && (
                <div className="break-all">
                  <span className="text-muted-foreground">ElevenLabs id: </span>
                  <span className="font-mono text-xs">{conv.externalId}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Handled by: </span>
                {conv.assignedTo ? (mine ? "you" : conv.assignedTo.name) : "nobody yet"}
              </div>
              {conv.summary && (
                <div className="rounded-md bg-muted p-2 text-xs">
                  <span className="text-muted-foreground">Outcome: </span>
                  {conv.summary}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
