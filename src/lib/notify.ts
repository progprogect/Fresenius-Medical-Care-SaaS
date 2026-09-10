import { getSettings } from "@/lib/settings";
import twilio from "twilio";

export type SendResult = {
  simulated: boolean;
  sid?: string;
  error?: string;
  to: string;
  body: string;
  channel: "whatsapp" | "sms";
};

/**
 * Sends a WhatsApp or SMS message through Twilio when channel settings are in
 * "live" mode with credentials; otherwise records a simulated send so the whole
 * flow can be demonstrated without a working Twilio account.
 */
export async function sendPatientMessage(params: {
  to: string; // E.164 phone
  body: string;
  channel: "whatsapp" | "sms";
}): Promise<SendResult> {
  const cfg = await getSettings("twilio");
  const base: SendResult = { simulated: true, to: params.to, body: params.body, channel: params.channel };

  if (cfg.mode !== "live" || !cfg.accountSid || !cfg.authToken) {
    return base; // demo mode
  }

  try {
    const client = twilio(cfg.accountSid, cfg.authToken);
    const from =
      params.channel === "whatsapp" ? cfg.whatsappFrom : cfg.phoneNumber;
    const to = params.channel === "whatsapp" ? `whatsapp:${params.to}` : params.to;
    const msg = await client.messages.create({ from, to, body: params.body });
    return { ...base, simulated: false, sid: msg.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Twilio send failed";
    console.error("Twilio send failed:", message);
    return { ...base, simulated: true, error: message };
  }
}
