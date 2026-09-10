import OpenAI from "openai";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { AGENT_TOOLS, executeTool, type ToolContext } from "@/lib/agent/tools";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

const MAX_TOOL_ROUNDS = 6;

export type ToolEvent = { name: string; args: unknown; result: unknown };

export type BrainReply = {
  reply: string;
  toolEvents: ToolEvent[];
  conversationStatus: string;
};

function openaiTools(): ChatCompletionTool[] {
  return AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: z.toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>,
    },
  }));
}

/**
 * Runs one user turn through the OpenAI tool loop, persisting all messages.
 * Used by the widget chat and by the WhatsApp inbound webhook.
 */
export async function runAgentTurn(conversationId: string, userText: string): Promise<BrainReply> {
  const agent = await getSettings("agent");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await db.message.create({
    data: { conversationId, role: "USER", content: userText },
  });

  const history = await db.message.findMany({
    where: { conversationId, role: { in: ["USER", "ASSISTANT", "TOOL"] } },
    orderBy: { createdAt: "asc" },
    take: 60,
  });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: await buildSystemPrompt("chat") },
    ...history.map((m): ChatCompletionMessageParam => {
      if (m.role === "USER") return { role: "user", content: m.content };
      if (m.role === "TOOL")
        return {
          role: "system",
          content: `[tool ${m.toolName} args ${JSON.stringify(m.toolPayload ?? {}).slice(0, 500)} returned] ${m.content.slice(0, 2500)}`,
        };
      return { role: "assistant", content: m.content };
    }),
  ];

  const ctx: ToolContext = { conversationId };
  const toolEvents: ToolEvent[] = [];
  let finalText = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const completion = await openai.chat.completions.create({
      model: agent.model,
      messages,
      tools: openaiTools(),
      tool_choice: round === MAX_TOOL_ROUNDS ? "none" : "auto",
      temperature: 0.3,
    });
    const choice = completion.choices[0];
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg as ChatCompletionMessageParam);
      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const result = await executeTool(call.function.name, args, ctx);
        toolEvents.push({ name: call.function.name, args, result });
        await db.message.create({
          data: {
            conversationId,
            role: "TOOL",
            toolName: call.function.name,
            content: JSON.stringify(result).slice(0, 8000),
            toolPayload: args as object,
          },
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    finalText = msg.content ?? "";
    break;
  }

  if (!finalText) {
    finalText =
      "I'm sorry, something went wrong on my side. A staff member will follow up with you shortly.";
  }

  await db.message.create({
    data: { conversationId, role: "ASSISTANT", content: finalText },
  });

  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  return { reply: finalText, toolEvents, conversationStatus: conv.status };
}
