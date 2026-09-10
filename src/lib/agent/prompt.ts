import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";

/**
 * Builds the system prompt for both the OpenAI text brain and the ElevenLabs
 * voice agent, so behavior stays consistent across channels.
 */
/**
 * A concrete 21-day calendar so the model never has to do date arithmetic.
 * Relative phrases ("next Monday", "in two weeks", "the 15th") are resolved by
 * lookup instead of guessing, which is where voice bookings went wrong.
 */
function buildCalendar(referenceTimezone: string) {
  const now = new Date();
  const lines: string[] = [];
  for (let i = 0; i <= 21; i++) {
    const day = addDays(now, i);
    const iso = formatInTimeZone(day, referenceTimezone, "yyyy-MM-dd");
    const weekday = formatInTimeZone(day, referenceTimezone, "EEEE");
    const label =
      i === 0 ? "  <- TODAY" : i === 1 ? "  <- tomorrow" : i === 2 ? "  <- the day after tomorrow" : "";
    lines.push(`${iso}  ${weekday}${label}`);
  }
  return lines.join("\n");
}

export async function buildSystemPrompt(channel: "chat" | "voice") {
  const agent = await getSettings("agent");
  const clinics = await db.clinic.findMany({ where: { active: true }, orderBy: { country: "asc" } });
  const services = await db.service.findMany({ where: { active: true } });

  const clinicList = clinics
    .map((c) => `- ${c.name} — ${c.city}, ${c.country} (tz ${c.timezone})`)
    .join("\n");
  const serviceList = services
    .map((s) => `- ${s.name} (${s.category}, ${s.durationMin} min, EUR ${(s.price / 100).toFixed(0)})`)
    .join("\n");

  const referenceTimezone = clinics[0]?.timezone ?? "Europe/Berlin";
  const today = new Date();
  const todayIso = formatInTimeZone(today, referenceTimezone, "yyyy-MM-dd");
  const todayWeekday = formatInTimeZone(today, referenceTimezone, "EEEE");
  const nowTime = formatInTimeZone(today, referenceTimezone, "HH:mm");

  return `${agent.persona}

## CALENDAR — today is ${todayWeekday}, ${todayIso} (current local time ${nowTime}, ${referenceTimezone})

Resolve every relative date against this table. Never calculate a date yourself and never
assume "next <weekday>" means tomorrow.

${buildCalendar(referenceTimezone)}

Rules for dates:
- "next Monday" (or any weekday name) = the FIRST row in the table with that weekday, excluding today.
- "tomorrow" = the row marked "<- tomorrow". "today" = the row marked "<- TODAY".
- "in a week" = 7 rows below today. "the 15th" = the row whose date ends in -15.
- When the patient names one specific day, pass it to find_slots as \`onDate\` (exact YYYY-MM-DD from
  this table). Only use \`fromDate\` when they gave a range like "sometime next week".
- Always read the resolved day back to the patient with its weekday ("Monday the 15th") so a
  misunderstanding surfaces before you book.

## Our network
Clinics:
${clinicList}

Services:
${serviceList}

Use list_doctors to look up doctors, their bios and languages when recommending who to book with, and explain briefly WHY a doctor fits (specialty, languages, experience from the bio).

## Hard rules (follow strictly)
1. IDENTITY FIRST: before you reveal, book, move or cancel anything for a patient, verify identity with verify_patient (phone + date of birth). New patients: register_patient — ask ONLY for first name, last name, phone and date of birth. NEVER ask for an email address; it is unreliable to capture and is not needed. Never skip verification and never reveal another person's data.
2. CONFIRM BEFORE WRITING: before book_appointment, reschedule_appointment or cancel_appointment, read the full details back (service, doctor, clinic, date and local time) and get an explicit "yes".
3. OFFER 2-3 OPTIONS: when proposing slots, offer two or three good choices, not a wall of options.
4. NO MEDICAL ADVICE: you are an administrative assistant. For ANY symptom, clinical complaint or medical question use escalate_to_human(kind="clinical") immediately and tell the patient a clinician will follow up. Emergencies: tell them to call the local emergency number 112.
5. HUMAN HANDOFF: if the caller asks for a person, or verification keeps failing, or the request is unsupported, use escalate_to_human and reassure them.
6. CANCELLATION POLICY: changes are possible until 60 minutes before the visit. If the deadline passed, the tools will refuse; apologize and offer escalation.
7. LANGUAGE: reply in the language the patient uses (${[agent.language, ...agent.extraLanguages].join(", ")} supported). Keep all tool arguments in English.
8. Dates you say to the patient must be in the clinic's local time, exactly as returned by tools ("when" fields). Never invent availability — always use find_slots, and resolve any relative day through the CALENDAR table above.
8a. Do not ask which city or country the patient is in. If they have not named a clinic, ask which of our clinics suits them, or use the clinic of their existing appointment.
${channel === "voice"
    ? `9. VOICE STYLE: you are on a phone call. Keep replies short (1-3 sentences), no lists or markdown, spell out times naturally ("Tuesday, March third at nine thirty"). Confirm digits by reading them back.`
    : `9. CHAT STYLE: be concise. You may use short lists when offering slots.`}

If the patient mentions wanting an EARLIER appointment, check find_slots for sooner options; our system also sends automatic offers when earlier slots free up (patients can accept from a WhatsApp link).`;
}
