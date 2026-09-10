"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";

const AgentInput = z.object({
  displayName: z.string().min(1),
  persona: z.string().min(10),
  firstMessage: z.string().min(5),
  language: z.string().min(2),
  extraLanguages: z.array(z.string()),
  model: z.string().min(2),
  voiceId: z.string(),
});

export async function saveAgentSettingsAction(input: z.infer<typeof AgentInput>) {
  await requireSession();
  const parsed = AgentInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid agent settings" };
  await saveSettings("agent", parsed.data);
  revalidatePath("/settings/agent");
  return { ok: true as const };
}
