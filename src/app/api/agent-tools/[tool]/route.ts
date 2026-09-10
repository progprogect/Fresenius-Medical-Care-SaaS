import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { executeTool } from "@/lib/agent/tools";

/**
 * Webhook endpoint the ElevenLabs voice agent calls for every tool.
 * Auth: shared secret header. The ElevenLabs conversation id arrives as
 * `conversation_id` (dynamic variable) and is mapped to our Conversation row.
 */
export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const secret = process.env.AGENT_TOOLS_SECRET || "";
  if (!secret || req.headers.get("x-agent-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const externalId = String(body.conversation_id ?? "");
  if (!externalId) return NextResponse.json({ error: "conversation_id missing" }, { status: 400 });

  let conv = await db.conversation.findFirst({ where: { externalId } });
  if (!conv) {
    conv = await db.conversation.create({
      data: { channel: "WIDGET_VOICE", externalId },
    });
  }

  const args = { ...body };
  delete args.conversation_id;

  const result = await executeTool(tool, args, { conversationId: conv.id });
  return NextResponse.json(result);
}
