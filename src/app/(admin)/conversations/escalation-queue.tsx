import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { fmtClinic } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimButton, ReleaseButton, ResolveButton } from "./escalation-actions";

export type QueueItem = {
  id: string;
  channel: string;
  startedAt: Date;
  escalationReason: string | null;
  patientName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
};

/**
 * Escalations pinned above the log. The AI hands a conversation over when a
 * patient reports symptoms, asks for a person, or fails verification — those
 * cannot wait for someone to scroll, so they sit at the top with the reason
 * visible and can be taken without opening them.
 */
export function EscalationQueue({
  items,
  currentUserId,
}: {
  items: QueueItem[];
  currentUserId: string;
}) {
  if (items.length === 0) return null;

  const unclaimed = items.filter((i) => !i.assignedToId).length;

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-amber-600" />
          Needs a human
          <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800">
            {items.length}
          </Badge>
          {unclaimed > 0 && (
            <span className="text-xs font-normal text-amber-800">{unclaimed} nobody has taken</span>
          )}
        </CardTitle>
        <CardDescription>
          The assistant handed these over. Take one to show colleagues you are on it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => {
          const mine = item.assignedToId === currentUserId;
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {item.patientName ?? <span className="font-normal text-muted-foreground">Unidentified caller</span>}
                  <span className="text-xs font-normal text-muted-foreground">
                    {item.channel.toLowerCase().replace(/_/g, " ")} ·{" "}
                    {fmtClinic(item.startedAt, "Europe/Berlin", "d MMM HH:mm")}
                  </span>
                  {item.assignedToName && (
                    <Badge variant={mine ? "default" : "secondary"} className="font-normal">
                      {mine ? "yours" : item.assignedToName}
                    </Badge>
                  )}
                </div>
                {item.escalationReason && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {item.escalationReason}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!item.assignedToId && <ClaimButton conversationId={item.id} />}
                {mine && (
                  <>
                    <ResolveButton conversationId={item.id} />
                    <ReleaseButton conversationId={item.id} />
                  </>
                )}
                <Link
                  href={`/conversations/${item.id}`}
                  className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent"
                >
                  Open
                  <ChevronRight className="size-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
