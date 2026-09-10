import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentTurn } from "@/lib/agent/brain";
import { getSettings } from "@/lib/settings";
import {
  createWidgetConversation,
  expireStaleVerification,
  isReusable,
  resolveOwnedConversation,
} from "@/lib/conversation-session";

const Body = z.object({
  conversationId: z.string().nullish(),
  clientToken: z.string().nullish(),
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // A caller may only continue a conversation it holds the token for; anything
  // else starts fresh rather than resuming a stranger's verified session.
  const owned = await resolveOwnedConversation(parsed.data.conversationId, parsed.data.clientToken);
  const conversation =
    owned && isReusable(owned)
      ? await expireStaleVerification(owned)
      : await createWidgetConversation("WIDGET_CHAT");

  try {
    const result = await runAgentTurn(conversation.id, parsed.data.message);
    return NextResponse.json({
      conversationId: conversation.id,
      clientToken: conversation.clientToken,
      ...result,
    });
  } catch (err) {
    console.error("agent chat failed", err);
    return NextResponse.json(
      {
        conversationId: conversation.id,
        clientToken: conversation.clientToken,
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
