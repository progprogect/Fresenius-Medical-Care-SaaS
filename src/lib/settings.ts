import { db } from "@/lib/db";

export type AgentSettings = {
  displayName: string;
  persona: string;
  /**
   * Primary ISO language of the voice agent. ElevenLabs forbids a multilingual
   * TTS model whenever this is "en", so an English-first agent can only ever
   * speak English; pick the market's own language to unlock the others.
   */
  language: string;
  extraLanguages: string[];
  model: string; // OpenAI model for text brain
  voiceId: string; // ElevenLabs voice, shared across every language
  elevenLabsAgentId: string;
  firstMessage: string;
  /** Cached greeting per extra language, keyed by ISO code. */
  firstMessageTranslations: Record<string, string>;
  /** Hash of the greeting the cache was built from. */
  translationsFor: string;
};

export type TwilioSettings = {
  mode: "demo" | "live";
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  whatsappFrom: string;
};

export type BackfillSettings = {
  enabled: boolean;
  horizonDays: number; // look this many days ahead for candidates to pull earlier
  offerTtlMinutes: number;
  maxOffersPerSlot: number;
  channels: Array<"whatsapp" | "sms">;
};

export type WidgetSettings = {
  greeting: string;
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  allowVoice: boolean;
  title: string;
};

const DEFAULTS: {
  agent: AgentSettings;
  twilio: TwilioSettings;
  backfill: BackfillSettings;
  widget: WidgetSettings;
} = {
  agent: {
    displayName: "Nora",
    persona:
      "You are Nora, the friendly virtual assistant of the Fresenius Medical Care clinic network. You help patients book, view, reschedule and cancel appointments across our European clinic network. You are warm, concise and professional. You never give medical advice.",
    language: "de",
    extraLanguages: ["en", "fr", "es", "it", "pl"],
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    voiceId: "eJRhExUeshH24BIBe89c", // Kate — natural, warm, professional
    elevenLabsAgentId: "",
    firstMessage:
      "Hello! I'm Nora, your clinic assistant. I can help you book, move or cancel an appointment. How can I help you today?",
    firstMessageTranslations: {},
    translationsFor: "",
  } satisfies AgentSettings,
  twilio: {
    mode: "demo",
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
  } satisfies TwilioSettings,
  backfill: {
    enabled: true,
    horizonDays: 14,
    offerTtlMinutes: 120,
    maxOffersPerSlot: 3,
    channels: ["whatsapp"],
  } satisfies BackfillSettings,
  widget: {
    greeting: "Need an appointment? Chat with our assistant.",
    primaryColor: "#0d9488",
    position: "bottom-right",
    allowVoice: true,
    title: "Fresenius Medical Care",
  } satisfies WidgetSettings,
};

export type SettingsKey = keyof typeof DEFAULTS;

export async function getSettings<K extends SettingsKey>(
  key: K
): Promise<(typeof DEFAULTS)[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return DEFAULTS[key];
  return { ...DEFAULTS[key], ...(row.value as object) } as (typeof DEFAULTS)[K];
}

export async function saveSettings<K extends SettingsKey>(
  key: K,
  value: Partial<(typeof DEFAULTS)[K]>
) {
  const current = await getSettings(key);
  const merged = { ...current, ...value };
  await db.setting.upsert({
    where: { key },
    update: { value: merged },
    create: { key, value: merged },
  });
  return merged;
}
