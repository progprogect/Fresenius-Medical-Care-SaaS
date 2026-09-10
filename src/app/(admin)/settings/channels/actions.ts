"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireSession } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";

const TwilioInput = z.object({
  mode: z.enum(["demo", "live"]),
  accountSid: z.string(),
  authToken: z.string(),
  phoneNumber: z.string(),
  whatsappFrom: z.string(),
});

export async function saveTwilioAction(input: z.infer<typeof TwilioInput>) {
  await requireAdmin();
  const parsed = TwilioInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid Twilio settings" };
  // A blank field means "keep the stored token", since the form is never given
  // the current value to send back.
  const { authToken, ...rest } = parsed.data;
  await saveSettings("twilio", authToken ? { ...rest, authToken } : rest);
  revalidatePath("/settings/channels");
  return { ok: true as const };
}

const BackfillInput = z.object({
  enabled: z.boolean(),
  horizonDays: z.number().int().min(1).max(60),
  offerTtlMinutes: z.number().int().min(5).max(2880),
  maxOffersPerSlot: z.number().int().min(1).max(10),
  channels: z.array(z.enum(["whatsapp", "sms"])),
});

export async function saveBackfillAction(input: z.infer<typeof BackfillInput>) {
  await requireSession();
  const parsed = BackfillInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid backfill settings" };
  await saveSettings("backfill", parsed.data);
  revalidatePath("/settings/channels");
  return { ok: true as const };
}

const WidgetInput = z.object({
  title: z.string().min(1),
  primaryColor: z.string(),
  position: z.enum(["bottom-right", "bottom-left"]),
  allowVoice: z.boolean(),
});

export async function saveWidgetAction(input: z.infer<typeof WidgetInput>) {
  await requireSession();
  const parsed = WidgetInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid widget settings" };
  await saveSettings("widget", parsed.data);
  revalidatePath("/settings/channels");
  return { ok: true as const };
}
