import Link from "next/link";
import { db } from "@/lib/db";
import { fmtClinic } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const where: Prisma.ConversationWhereInput = {};
  if (status) where.status = status as Prisma.ConversationWhereInput["status"];

  const conversations = await db.conversation.findMany({
    where,
    include: {
      patient: true,
      messages: { orderBy: { createdAt: "desc" }, take: 1, where: { role: { in: ["USER", "ASSISTANT"] } } },
      _count: { select: { messages: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Conversations"
        description="Every chat and voice session the AI assistant has handled"
      />
      <Card>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/conversations/${c.id}`} className="hover:underline">
                      {fmtClinic(c.startedAt, "Europe/Berlin", "d MMM HH:mm")}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{c.channel.toLowerCase().replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-medium">
                    {c.patient ? `${c.patient.firstName} ${c.patient.lastName}` : <span className="text-muted-foreground">Unidentified</span>}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                    {c.messages[0]?.content ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{c._count.messages}</TableCell>
                  <TableCell className="text-xs">{c.verified ? "yes" : "no"}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                </TableRow>
              ))}
              {conversations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No conversations yet. Open the demo site and talk to the assistant.
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
