import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentTurn } from "@/lib/agent/brain";
import { getSettings } from "@/lib/settings";
import { technicalTrouble } from "@/lib/languages";
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
        reply: technicalTrouble(conversation.language),
        toolEvents: [],
        conversationStatus: "ACTIVE",
        language: conversation.language,
        error: true,
      },
      { status: 200 }
    );
  }
}

export async function GET() {
  const widget = await getSettings("widget");
  const agent = await getSettings("agent");
  // Staff may write the greeting in any language; the visitor must read it in
  // the network's own one, which is the translation the voice agent also opens with.
  const greeting = agent.firstMessageTranslations?.[agent.language] ?? agent.firstMessage;
  return NextResponse.json({
    title: widget.title,
    greeting,
    language: agent.language,
    primaryColor: widget.primaryColor,
    allowVoice: widget.allowVoice,
    voiceReady: Boolean(agent.elevenLabsAgentId),
  });
}
