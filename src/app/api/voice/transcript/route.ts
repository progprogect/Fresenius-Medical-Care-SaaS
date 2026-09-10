import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const Body = z.object({
  conversationId: z.string().min(4),
  externalId: z.string().optional(),
  role: z.enum(["user", "ai"]),
  text: z.string().min(1).max(4000),
});

/** Persists live voice transcripts so staff read one thread per visitor. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { conversationId, externalId, role, text } = parsed.data;

  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) return NextResponse.json({ error: "unknown conversation" }, { status: 404 });
  if (externalId && conv.externalId !== externalId) {
    await db.conversation.update({ where: { id: conv.id }, data: { externalId } });
  }

  await db.message.create({
    data: {
      conversationId: conv.id,
      role: role === "user" ? "USER" : "ASSISTANT",
      content: text,
    },
  });
  return NextResponse.json({ ok: true });
}
