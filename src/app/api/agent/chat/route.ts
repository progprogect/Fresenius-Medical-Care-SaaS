import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/brain";
import { getSettings } from "@/lib/settings";

const Body = z.object({
  conversationId: z.string().nullish(),
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  let conversationId = parsed.data.conversationId ?? undefined;
  if (conversationId) {
    const exists = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!exists) conversationId = undefined;
  }
  if (!conversationId) {
    const conv = await db.conversation.create({ data: { channel: "WIDGET_CHAT" } });
    conversationId = conv.id;
  }

  try {
    const result = await runAgentTurn(conversationId, parsed.data.message);
    return NextResponse.json({ conversationId, ...result });
  } catch (err) {
    console.error("agent chat failed", err);
    return NextResponse.json(
      {
        conversationId,
        reply:
          "I'm having technical trouble right now. Please try again in a moment or call the clinic directly.",
        toolEvents: [],
        conversationStatus: "ACTIVE",
        error: true,
      },
      { status: 200 }
    );
  }
}

export async function GET() {
  const widget = await getSettings("widget");
  const agent = await getSettings("agent");
  return NextResponse.json({
    title: widget.title,
    greeting: agent.firstMessage,
    primaryColor: widget.primaryColor,
    allowVoice: widget.allowVoice,
    voiceReady: Boolean(agent.elevenLabsAgentId),
  });
}
