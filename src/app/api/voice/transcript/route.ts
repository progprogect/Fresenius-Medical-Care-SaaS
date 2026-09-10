import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const Body = z.object({
  externalId: z.string().min(4),
  role: z.enum(["user", "ai"]),
  text: z.string().min(1).max(4000),
});

/** Persists live voice transcripts from the widget so staff can read them in the admin panel. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { externalId, role, text } = parsed.data;

  let conv = await db.conversation.findFirst({ where: { externalId } });
  if (!conv) {
    conv = await db.conversation.create({ data: { channel: "WIDGET_VOICE", externalId } });
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
