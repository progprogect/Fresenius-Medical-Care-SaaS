import { z } from "zod";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { buildCalendarBlock, buildSystemPrompt, CALENDAR_VARIABLE } from "@/lib/agent/prompt";
import { getSettings, saveSettings } from "@/lib/settings";
import { languageLabel } from "@/lib/languages";
import { createHash } from "node:crypto";
import OpenAI from "openai";

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

export type VoiceOption = {
  voiceId: string;
  name: string;
  labels: string;
  category: string;
  saved: boolean;
};

/**
 * Voices offered in the admin panel. Voices saved in the workspace (cloned,
 * professional, generated) come first — those are the curated, most natural
 * ones — followed by the premade library.
 */
export async function listVoices(): Promise<VoiceOption[]> {
  const data = (await el("/v1/voices?page_size=100")) as {
    voices?: Array<{
      voice_id: string;
      name: string;
      category?: string;
      labels?: Record<string, string>;
    }>;
  };
  const options = (data.voices ?? []).map((v) => {
    const category = v.category ?? "premade";
    return {
      voiceId: v.voice_id,
      name: v.name,
      labels: Object.values(v.labels ?? {}).filter(Boolean).join(", "),
      category,
      saved: category !== "premade",
    };
  });
  return options.sort((a, b) => {
    if (a.saved !== b.saved) return a.saved ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
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
 * English-only TTS models. ElevenLabs rejects any multilingual model while the
 * agent's primary language is "en", which is why an English-first agent can
 * never speak good German.
 */
const ENGLISH_ONLY_TTS = "eleven_turbo_v2";
const MULTILINGUAL_TTS = "eleven_turbo_v2_5";

function greetingHash(text: string) {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

/**
 * Translates the greeting into every extra language once and caches it, so a
 * German caller is met in German rather than by an English sentence read with
 * a German voice.
 */
async function greetingTranslations(firstMessage: string, languages: string[]) {
  const agent = await getSettings("agent");
  const hash = greetingHash(firstMessage);
  const cached = agent.firstMessageTranslations ?? {};
  const missing = languages.filter((code) => !cached[code]);
  if (agent.translationsFor === hash && missing.length === 0) return cached;

  const fresh: Record<string, string> = agent.translationsFor === hash ? { ...cached } : {};
  const todo = agent.translationsFor === hash ? missing : languages;
  if (todo.length > 0 && process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: agent.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Translate the clinic assistant's greeting. Keep the warm, spoken register and the assistant's name. Reply as JSON mapping each ISO code to its translation, nothing else.",
        },
        {
          role: "user",
          content: `Greeting: ${JSON.stringify(firstMessage)}\nTarget languages: ${todo.join(", ")}`,
        },
      ],
    });
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, string>;
      for (const code of todo) if (parsed[code]) fresh[code] = parsed[code];
    } catch {
      // Fall through: an untranslated greeting is better than a failed sync.
    }
  }
  await saveSettings("agent", { firstMessageTranslations: fresh, translationsFor: hash });
  return fresh;
}

/**
 * Creates the ElevenLabs conversational agent or updates the existing one so
 * its prompt, tools and languages always mirror the admin settings.
 */
export async function syncElevenLabsAgent() {
  const agent = await getSettings("agent");
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const secret = process.env.AGENT_TOOLS_SECRET || "";
  // The agent stores a snapshot of this prompt, so the calendar goes in as a
  // dynamic variable supplied at call time rather than a frozen table.
  const prompt = await buildSystemPrompt("voice", { calendarAsVariable: true });

  const extras = agent.extraLanguages.filter((code) => code !== agent.language);
  const multilingual = extras.length > 0 || agent.language !== "en";
  if (multilingual && agent.language === "en") {
    throw new Error(
      "ElevenLabs does not allow extra languages while the primary language is English. Choose a non-English primary language (German, for example) and list English among the additional ones."
    );
  }

  // The greeting is written once in whatever language staff prefer and
  // translated into every configured language, the primary one included —
  // otherwise a German-first agent would open the call in English.
  const translations = multilingual
    ? await greetingTranslations(agent.firstMessage, [agent.language, ...extras])
    : {};
  const primaryGreeting = translations[agent.language] ?? agent.firstMessage;
  const languagePresets = Object.fromEntries(
    extras.map((code) => [
      code,
      {
        overrides: {
          agent: { first_message: translations[code] ?? agent.firstMessage },
        },
      },
    ])
  );

  const body = {
    name: `Fresenius Medical Care Assistant (${agent.displayName})`,
    conversation_config: {
      agent: {
        first_message: primaryGreeting,
        language: agent.language,
        prompt: {
          prompt,
          llm: agent.voiceLlm,
          temperature: 0.3,
          tools: webhookTools(baseUrl, secret),
        },
      },
      tts: {
        voice_id: agent.voiceId,
        // One voice across every language: the multilingual model speaks the
        // same cloned voice, so callers hear the same person throughout.
        model_id: multilingual ? MULTILINGUAL_TTS : ENGLISH_ONLY_TTS,
      },
      language_presets: languagePresets,
    },
    // The widget opens the call in the visitor's own language when it can.
    platform_settings: {
      overrides: {
        conversation_config_override: {
          agent: { language: true },
        },
      },
    },
  };

  const languages = [agent.language, ...extras].map(languageLabel);

  if (agent.elevenLabsAgentId) {
    await el(`/v1/convai/agents/${agent.elevenLabsAgentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return { agentId: agent.elevenLabsAgentId, created: false, languages, multilingual };
  }

  const created = (await el("/v1/convai/agents/create", {
    method: "POST",
    body: JSON.stringify(body),
  })) as { agent_id: string };
  await saveSettings("agent", { elevenLabsAgentId: created.agent_id });
  return { agentId: created.agent_id, created: true, languages, multilingual };
}

/**
 * Signed URL plus the per-call variables the agent's prompt expects, so the
 * browser widget can open a private-agent voice session that knows today's date.
 */
export async function getSignedUrl() {
  const agent = await getSettings("agent");
  if (!agent.elevenLabsAgentId) throw new Error("Voice agent is not provisioned yet");
  const data = (await el(
    `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent.elevenLabsAgentId)}`
  )) as { signed_url: string };
  return {
    signedUrl: data.signed_url,
    dynamicVariables: { [CALENDAR_VARIABLE]: await buildCalendarBlock() },
    languages: [agent.language, ...agent.extraLanguages.filter((c) => c !== agent.language)],
  };
}
