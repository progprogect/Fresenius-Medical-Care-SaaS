import { z } from "zod";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { getSettings, saveSettings } from "@/lib/settings";

const BASE = "https://api.elevenlabs.io";

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

async function el(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`ElevenLabs ${init?.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

export async function listVoices(): Promise<Array<{ voiceId: string; name: string; labels: string }>> {
  const data = (await el("/v1/voices")) as {
    voices?: Array<{ voice_id: string; name: string; labels?: Record<string, string> }>;
  };
  return (data.voices ?? []).map((v) => ({
    voiceId: v.voice_id,
    name: v.name,
    labels: Object.values(v.labels ?? {}).join(", "),
  }));
}

type JsonSchemaNode = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  [key: string]: unknown;
};

/** ElevenLabs requires every property to carry a description (or dynamic variable). */
function ensureDescriptions(node: JsonSchemaNode, fallback: string) {
  if (!node.description && !node.dynamic_variable && !node.constant_value) {
    node.description = fallback;
  }
  delete node.$schema;
  delete node.additionalProperties;
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      ensureDescriptions(child, key);
    }
  }
  if (node.items) ensureDescriptions(node.items, `${fallback} item`);
  return node;
}

/** Webhook tool definitions for the ElevenLabs agent, mirroring our registry. */
function webhookTools(baseUrl: string, secret: string) {
  return AGENT_TOOLS.map((t) => {
    const jsonSchema = ensureDescriptions(
      z.toJSONSchema(t.schema, { target: "draft-7" }) as JsonSchemaNode,
      t.name
    ) as { properties?: Record<string, unknown>; required?: string[] };
    const properties: Record<string, unknown> = {
      ...(jsonSchema.properties ?? {}),
      conversation_id: {
        type: "string",
        dynamic_variable: "system__conversation_id",
      },
    };
    return {
      type: "webhook",
      name: t.name,
      description: t.description,
      api_schema: {
        url: `${baseUrl}/api/agent-tools/${t.name}`,
        method: "POST",
        request_body_schema: {
          type: "object",
          properties,
          required: ["conversation_id", ...(jsonSchema.required ?? [])],
        },
        request_headers: { "x-agent-secret": secret },
      },
    };
  });
}

/**
 * Creates the ElevenLabs conversational agent or updates the existing one so
 * its prompt/tools always mirror the admin settings.
 */
export async function syncElevenLabsAgent() {
  const agent = await getSettings("agent");
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const secret = process.env.AGENT_TOOLS_SECRET || "";
  const prompt = await buildSystemPrompt("voice");

  const body = {
    name: `Clinic Assistant (${agent.displayName})`,
    conversation_config: {
      agent: {
        first_message: agent.firstMessage,
        language: agent.language,
        prompt: {
          prompt,
          llm: "gpt-4o-mini",
          temperature: 0.3,
          tools: webhookTools(baseUrl, secret),
        },
      },
      tts: {
        voice_id: agent.voiceId,
        model_id: "eleven_turbo_v2",
      },
    },
  };

  if (agent.elevenLabsAgentId) {
    await el(`/v1/convai/agents/${agent.elevenLabsAgentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return { agentId: agent.elevenLabsAgentId, created: false };
  }

  const created = (await el("/v1/convai/agents/create", {
    method: "POST",
    body: JSON.stringify(body),
  })) as { agent_id: string };
  await saveSettings("agent", { elevenLabsAgentId: created.agent_id });
  return { agentId: created.agent_id, created: true };
}

/** Signed URL so the browser widget can open a private-agent voice session. */
export async function getSignedUrl() {
  const agent = await getSettings("agent");
  if (!agent.elevenLabsAgentId) throw new Error("Voice agent is not provisioned yet");
  const data = (await el(
    `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent.elevenLabsAgentId)}`
  )) as { signed_url: string };
  return data.signed_url;
}
