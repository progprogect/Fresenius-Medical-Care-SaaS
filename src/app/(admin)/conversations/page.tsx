import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { FilterBar, type FilterDef } from "@/components/admin/filter-bar";
import { resultLabel } from "@/components/admin/result-count";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const LIMIT = 200;

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams;
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

  const conversations = await db.conversation.findMany({
    where,
    include: {
      patient: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        where: { role: { in: ["USER", "ASSISTANT"] } },
      },
      _count: { select: { messages: true } },
    },
    orderBy: { startedAt: "desc" },
    take: LIMIT,
  });

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
      kind: "select", key: "verified", label: "Verification", allLabel: "Any verification",
      options: [
        { value: "yes", label: "Verified caller" },
        { value: "no", label: "Not verified" },
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
      <FilterBar filters={filters} resultLabel={resultLabel(conversations.length, LIMIT)} />
      <Card className="mt-3">
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Last message</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer transition-colors hover:bg-accent/60"
                >
                  <TableCell className="whitespace-nowrap p-0 font-mono text-xs">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      {fmtClinic(c.startedAt, "Europe/Berlin", "d MMM HH:mm")}
                    </Link>
                  </TableCell>
                  <TableCell className="p-0 text-xs">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      {c.channel.toLowerCase().replace(/_/g, " ")}
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
                  <TableCell className="p-0">
                    <Link href={`/conversations/${c.id}`} className="block px-2 py-2">
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {conversations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No conversations match the filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
