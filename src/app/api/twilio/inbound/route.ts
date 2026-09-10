import { db } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/brain";

/**
 * Twilio inbound webhook (WhatsApp / SMS). Configure in Twilio console:
 * Messaging webhook -> POST {APP_BASE_URL}/api/twilio/inbound
 * The sender's phone is treated as a possession factor: if it matches a
 * patient record, the conversation starts verified for that patient.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const from = String(form?.get("From") ?? ""); // e.g. "whatsapp:+491511..."
  const bodyText = String(form?.get("Body") ?? "").trim();

  const phone = from.replace(/^whatsapp:/, "");
  if (!phone || !bodyText) {
    return twiml("Sorry, I could not read your message.");
  }

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
        verified: Boolean(patient), // registered channel = possession factor
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
