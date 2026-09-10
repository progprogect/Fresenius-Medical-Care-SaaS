import twilio from "twilio";
import { db } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/brain";
import { getSettings } from "@/lib/settings";
import { newClientToken } from "@/lib/conversation-session";

/**
 * Twilio inbound webhook (WhatsApp / SMS). Configure in Twilio console:
 * Messaging webhook -> POST {APP_BASE_URL}/api/twilio/inbound
 *
 * The request signature is verified first. The sender's phone is treated as a
 * possession factor, so an unsigned request could otherwise claim any
 * patient's number and read or cancel their appointments.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return twiml("Sorry, I could not read your message.");

  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const cfg = await getSettings("twilio");
  const signature = req.headers.get("x-twilio-signature");
  const url = `${process.env.APP_BASE_URL ?? new URL(req.url).origin}/api/twilio/inbound`;
  const authentic =
    Boolean(cfg.authToken) &&
    Boolean(signature) &&
    twilio.validateRequest(cfg.authToken, signature!, url, params);

  if (!authentic) {
    console.warn("Rejected an unsigned Twilio webhook request");
    return new Response("forbidden", { status: 403 });
  }

  const from = String(params.From ?? "");
  const bodyText = String(params.Body ?? "").trim();
  const phone = from.replace(/^whatsapp:/, "");
  if (!phone || !bodyText) return twiml("Sorry, I could not read your message.");

  let conv = await db.conversation.findFirst({
    where: { channel: "WHATSAPP", status: "ACTIVE", patient: { phone } },
    orderBy: { startedAt: "desc" },
  });
  if (!conv) {
    const patient = await db.patient.findUnique({ where: { phone } });
    conv = await db.conversation.create({
      data: {
        channel: "WHATSAPP",
        patientId: patient?.id,
        // A verified Twilio signature makes the sender's own number a
        // legitimate possession factor.
        verified: Boolean(patient),
        verifiedAt: patient ? new Date() : null,
        clientToken: newClientToken(),
      },
    });
  }

  try {
    const result = await runAgentTurn(conv.id, bodyText);
    return twiml(result.reply);
  } catch (err) {
    console.error("whatsapp turn failed", err);
    return twiml("Sorry, I'm having technical trouble. A staff member will follow up.");
  }
}

function twiml(message: string) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}
