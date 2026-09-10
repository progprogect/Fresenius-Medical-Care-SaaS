import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executeTool } from "@/lib/agent/tools";

/**
 * Webhook endpoint the ElevenLabs voice agent calls for every tool.
 * Auth: shared secret header.
 *
 * The widget passes our own conversation id into the call, so a voice turn
 * lands in the same thread as the chat next to it. A call started elsewhere
 * (a phone line) has no such id, and falls back to the ElevenLabs one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const secret = process.env.AGENT_TOOLS_SECRET || "";
  if (!secret || req.headers.get("x-agent-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const appConversationId = String(body.app_conversation_id ?? "").trim();
  const externalId = String(body.conversation_id ?? "").trim();

  let conversation = appConversationId
    ? await db.conversation.findUnique({ where: { id: appConversationId } })
    : null;

  if (conversation && externalId && conversation.externalId !== externalId) {
    conversation = await db.conversation.update({
      where: { id: conversation.id },
      data: { externalId },
    });
  }
  if (!conversation) {
    if (!externalId) return NextResponse.json({ error: "conversation_id missing" }, { status: 400 });
    conversation =
      (await db.conversation.findFirst({ where: { externalId } })) ??
      (await db.conversation.create({ data: { channel: "WIDGET_VOICE", externalId } }));
  }

  const args = { ...body };
  delete args.conversation_id;
  delete args.app_conversation_id;

  const result = await executeTool(tool, args, { conversationId: conversation.id });
  return NextResponse.json(result);
}
