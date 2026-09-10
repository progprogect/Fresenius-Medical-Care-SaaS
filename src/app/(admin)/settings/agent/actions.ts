"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";

const AgentInput = z.object({
  displayName: z.string().min(1),
  persona: z.string().min(10),
  firstMessage: z.string().min(5),
  language: z.string().min(2),
  extraLanguages: z.array(z.string()),
  model: z.string().min(2),
  voiceLlm: z.string().min(2),
  voiceId: z.string(),
});

const SUPPORTED = new Set<string>(SUPPORTED_LANGUAGES.map((l) => l.code));

export async function saveAgentSettingsAction(input: z.infer<typeof AgentInput>) {
  await requireSession();
  const parsed = AgentInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid agent settings" };
  if (!SUPPORTED.has(parsed.data.language))
    return { ok: false as const, error: "That primary language is not supported" };
  const extraLanguages = [...new Set(parsed.data.extraLanguages)].filter(
    (code) => SUPPORTED.has(code) && code !== parsed.data.language
  );
  await saveSettings("agent", { ...parsed.data, extraLanguages });
  revalidatePath("/settings/agent");
  return { ok: true as const };
}
