import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveOwnedConversation } from "@/lib/conversation-session";

const Body = z.object({
  conversationId: z.string().min(4),
  clientToken: z.string().min(8),
  role: z.enum(["user", "ai"]),
  text: z.string().min(1).max(4000),
});

/**
 * Persists live voice transcripts so staff read one thread per visitor.
 * The capability token is required: without it anyone could forge the
 * transcript staff rely on, and that text is replayed to the model as history.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const conversation = await resolveOwnedConversation(
    parsed.data.conversationId,
    parsed.data.clientToken
  );
  if (!conversation) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await db.message.create({
    data: {
      conversationId: conversation.id,
      role: parsed.data.role === "user" ? "USER" : "ASSISTANT",
      content: parsed.data.text,
    },
  });
  return NextResponse.json({ ok: true });
}
