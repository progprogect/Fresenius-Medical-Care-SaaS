import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { FilterBar, type FilterDef } from "@/components/admin/filter-bar";
import { Pagination } from "@/components/admin/pagination";
import { parsePage } from "@/lib/pagination";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { languageLabel, SUPPORTED_LANGUAGES } from "@/lib/languages";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EscalationQueue } from "./escalation-queue";
import { ClaimButton } from "./escalation-actions";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const now = new Date();
  const where: Prisma.ConversationWhereInput = {};
  const and: Prisma.ConversationWhereInput[] = [];

  if (p.status && p.status !== "all")
    where.status = p.status as Prisma.ConversationWhereInput["status"];
  if (p.channel && p.channel !== "all")
    where.channel = p.channel as Prisma.ConversationWhereInput["channel"];
  if (p.verified === "yes") and.push({ verified: true });
  if (p.verified === "no") and.push({ verified: false });
  if (p.identified === "yes") and.push({ NOT: { patientId: null } });
  if (p.identified === "no") and.push({ patientId: null });
  if (p.language && p.language !== "all") and.push({ language: p.language });
  if (p.owner === "mine") and.push({ assignedToId: session.id });
  if (p.owner === "unclaimed") and.push({ assignedToId: null, status: "NEEDS_HUMAN" });
  if (p.q) {
    and.push({
      OR: [
        { patient: { firstName: { contains: p.q, mode: "insensitive" } } },
        { patient: { lastName: { contains: p.q, mode: "insensitive" } } },
        { patient: { phone: { contains: p.q } } },
        { messages: { some: { content: { contains: p.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (p.since === "today") {
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    and.push({ startedAt: { gte: dayStart } });
  } else if (p.since === "week") {
    and.push({ startedAt: { gte: new Date(now.getTime() - 7 * 86400000) } });
  } else if (p.since === "month") {
    and.push({ startedAt: { gte: new Date(now.getTime() - 30 * 86400000) } });
  }
  if (and.length) where.AND = and;

  const total = await db.conversation.count({ where });
  const page = parsePage(p.page, total, PAGE_SIZE);
  const [conversations, escalations] = await Promise.all([
    db.conversation.findMany({
      where,
      include: {
        patient: true,
        assignedTo: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          where: { role: { in: ["USER", "ASSISTANT"] } },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    // The handover queue is never filtered away: an escalation the filters
    // would hide is exactly the one somebody could miss.
    db.conversation.findMany({
      where: { status: "NEEDS_HUMAN" },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: [{ assignedToId: "asc" }, { startedAt: "asc" }],
      take: 20,
    }),
  ]);

  const filters: FilterDef[] = [
    { kind: "search", key: "q", label: "Search", placeholder: "Patient or message text" },
    {
      kind: "select", key: "status", label: "Status", allLabel: "Any status", primary: true,
      options: [
        { value: "NEEDS_HUMAN", label: "Needs human" },
        { value: "ACTIVE", label: "Active" },
        { value: "RESOLVED", label: "Resolved" },
      ],
    },
    {
      kind: "select", key: "channel", label: "Channel", allLabel: "Any channel", primary: true,
      options: [
        { value: "WIDGET_CHAT", label: "Widget chat" },
        { value: "WIDGET_VOICE", label: "Widget voice" },
        { value: "PHONE", label: "Phone" },
        { value: "WHATSAPP", label: "WhatsApp" },
      ],
    },
    {
      kind: "select", key: "since", label: "Started", allLabel: "Any time",
      options: [
        { value: "today", label: "Today" },
        { value: "week", label: "Last 7 days" },
        { value: "month", label: "Last 30 days" },
      ],
    },
    {
      kind: "select", key: "language", label: "Language", allLabel: "Any language",
      options: SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label })),
    },
    {
      kind: "select", key: "verified", label: "Verification", allLabel: "Any verification",
      options: [
        { value: "yes", label: "Verified caller" },
        { value: "no", label: "Not verified" },
      ],
    },
    {
      kind: "select", key: "owner", label: "Ownership", allLabel: "Anyone",
      options: [
        { value: "unclaimed", label: "Escalations nobody took" },
        { value: "mine", label: "Taken by me" },
      ],
    },
    {
      kind: "select", key: "identified", label: "Patient link", allLabel: "Any patient link",
      options: [
        { value: "yes", label: "Linked to patient" },
        { value: "no", label: "Unidentified" },
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Conversations"
        description="Every chat and voice session the AI assistant handled — click a row to read the full transcript"
      />
      <EscalationQueue
        currentUserId={session.id}
        items={escalations.map((c) => ({
          id: c.id,
          channel: c.channel,
          startedAt: c.startedAt,
          escalationReason: c.escalationReason,
          patientName: c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : null,
          assignedToId: c.assignedToId,
          assignedToName: c.assignedTo?.name ?? null,
        }))}
      />
      <FilterBar filters={filters} resultLabel={`${total} ${total === 1 ? "result" : "results"}`} />
      <Card className="mt-3">
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Last message</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Handled by</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((c) => (
                <TableRow
                  key={c.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-accent/60",
                    c.status === "NEEDS_HUMAN" && "bg-amber-50/60 hover:bg-amber-50"
                  )}
                >
                  <TableCell className="whitespace-nowrap p-0 font-mono text-xs">
                    <Link href={`/conversations/${c.id}`} className="flex items-center gap-1.5 px-2 py-2">
                      {c.status === "NEEDS_HUMAN" && (
                        <AlertTriangle className="size-3.5 shrink-0 text-amber-600" aria-label="Needs a human" />
                      )}
                      {fmtClinic(c.startedAt, "Europe/Berlin", "d MMM HH:mm")}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-xs">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      {c.channel.toLowerCase().replace(/_/g, " ")}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-xs">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      {c.language ? (
                        languageLabel(c.language)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 font-medium">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      {c.patient ? (
                        `${c.patient.firstName} ${c.patient.lastName}`
                      ) : (
                        <span className="font-normal text-muted-foreground">Unidentified</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md p-0 text-sm text-muted-foreground">
                    <Link href={`/conversations/${c.id}`} className="block truncate px-2 py-2">
                      {c.messages[0]?.content ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-right">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      {c._count.messages}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-xs">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      {c.verified ? "yes" : "no"}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      <StatusBadge status={c.status} />
                    </Link>
                  </TableCell>
                  <TableCell className="px-2 py-1.5">
                    {c.assignedTo ? (
                      <Badge
                        variant={c.assignedTo.id === session.id ? "default" : "secondary"}
                        className="font-normal"
                      >
                        {c.assignedTo.id === session.id ? "You" : c.assignedTo.name}
                      </Badge>
                    ) : c.status === "NEEDS_HUMAN" ? (
                      <ClaimButton conversationId={c.id} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="p-0">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {conversations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    No conversations match the filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </div>
  );
}
