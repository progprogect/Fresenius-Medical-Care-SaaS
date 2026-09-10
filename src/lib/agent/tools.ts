import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  bookAppointment,
  cancelAppointment,
  findAvailableSlots,
  rescheduleAppointment,
  SchedulingError,
} from "@/lib/scheduling";
import { createOffersForFreedSlot } from "@/lib/backfill";
import { fmtClinic } from "@/lib/format";
import { fullNameSimilarity, isRealName, parseDateOfBirth, parsePhone } from "@/lib/patient-input";
import { MAX_FAILED_VERIFICATIONS } from "@/lib/conversation-session";
import { continueInLanguage, isSupportedLanguage, languageLabel, SUPPORTED_LANGUAGES } from "@/lib/languages";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Single tool registry shared by the OpenAI text brain and the ElevenLabs
 * voice agent (via webhook endpoints). Context = our Conversation row, which
 * carries the verified-patient session (UC-1).
 */

export type ToolContext = {
  conversationId: string;
};

type ToolDef = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

function slotRef(doctorId: string, startsAt: Date) {
  return `${doctorId}@${startsAt.toISOString()}`;
}
function parseSlotRef(ref: string) {
  const at = ref.lastIndexOf("@");
  if (at < 1) throw new SchedulingError("BAD_SLOT_REF", "Invalid slot reference");
  const doctorId = ref.slice(0, at);
  const startsAt = new Date(ref.slice(at + 1));
  if (isNaN(startsAt.getTime()))
    throw new SchedulingError("BAD_SLOT_REF", "Invalid slot reference date");
  return { doctorId, startsAt };
}

async function getConversation(ctx: ToolContext) {
  const conv = await db.conversation.findUnique({
    where: { id: ctx.conversationId },
    include: { patient: true },
  });
  if (!conv) throw new SchedulingError("NO_CONVERSATION", "Conversation not found");
  return conv;
}

async function requireVerifiedPatient(ctx: ToolContext) {
  const conv = await getConversation(ctx);
  if (!conv.verified || !conv.patient)
    throw new SchedulingError(
      "NOT_VERIFIED",
      "The caller is not verified yet. Use verify_patient (phone + date of birth) or register_patient for a new patient before accessing appointments."
    );
  return { conv, patient: conv.patient };
}

const actorFor = (ctx: ToolContext) => `ai-agent:${ctx.conversationId}`;

/** "1985-04-12" -> "12 April 1985", so the agent can read a date back aloud. */
function spellDate(isoDate: string) {
  return formatInTimeZone(new Date(`${isoDate}T00:00:00Z`), "UTC", "d MMMM yyyy");
}

/** Groups digits so a phone number can be read back in chunks. */
function spellPhone(digits: string) {
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

// ---------------------------------------------------------------- tools ----

const listClinics: ToolDef = {
  name: "list_clinics",
  description:
    "List clinics of the network, optionally filtered by city or country. Use it to tell the patient where we operate and to pick a clinic.",
  schema: z.object({
    city: z.string().optional().describe("Filter by city name, e.g. 'Berlin'"),
    country: z.string().optional().describe("Filter by country name, e.g. 'Germany'"),
  }),
  execute: async (args) => {
    const where: Record<string, unknown> = { active: true };
    if (args.city) where.city = { contains: String(args.city), mode: "insensitive" };
    if (args.country) where.country = { contains: String(args.country), mode: "insensitive" };
    const clinics = await db.clinic.findMany({
      where,
      orderBy: [{ country: "asc" }, { city: "asc" }],
      include: { _count: { select: { doctors: true } } },
    });
    return clinics.map((c) => ({
      clinicId: c.id,
      name: c.name,
      city: c.city,
      country: c.country,
      address: c.address,
      phone: c.phone,
      timezone: c.timezone,
      doctors: c._count.doctors,
    }));
  },
};

const listServices: ToolDef = {
  name: "list_services",
  description:
    "List medical services (procedures) we offer with duration and price. Use it to help the patient choose the right procedure.",
  schema: z.object({}),
  execute: async () => {
    const services = await db.service.findMany({ where: { active: true }, orderBy: { category: "asc" } });
    return services.map((s) => ({
      serviceId: s.id,
      name: s.name,
      category: s.category,
      durationMin: s.durationMin,
      priceEur: s.price / 100,
      description: s.description,
      preparation: s.prepInstructions,
    }));
  },
};

const listDoctors: ToolDef = {
  name: "list_doctors",
  description:
    "List doctors with specialty, bio and languages. Filter by clinic and/or service. Use bios to recommend the right doctor and explain why.",
  schema: z.object({
    clinicId: z.string().optional(),
    serviceId: z.string().optional(),
  }),
  execute: async (args) => {
    const doctors = await db.doctor.findMany({
      where: {
        active: true,
        ...(args.clinicId ? { clinicId: String(args.clinicId) } : {}),
        ...(args.serviceId
          ? { services: { some: { serviceId: String(args.serviceId) } } }
          : {}),
      },
      include: { clinic: true, services: { include: { service: true } } },
      orderBy: { name: "asc" },
    });
    return doctors.map((d) => ({
      doctorId: d.id,
      name: `${d.title} ${d.name}`,
      specialty: d.specialty,
      bio: d.bio,
      languages: d.languages,
      clinic: `${d.clinic.name}, ${d.clinic.city}`,
      clinicId: d.clinicId,
      services: d.services.map((s) => s.service.name),
    }));
  },
};

/** Below this, a spoken name is too far from the record to even read back. */
const NAME_CONFIRM_FLOOR = 0.7;

const verifyPatient: ToolDef = {
  name: "verify_patient",
  description:
    "REQUIRED before disclosing appointments or making changes for an existing patient. The date of birth is always needed, plus ONE of: the phone number, or the first and last name. Ask for it as a choice — \"your phone number, or your name and date of birth\" — and pass whatever they give, exactly as they said it; any spelling, ordering or date format is understood. If the tool answers needsConfirmation, read the name and date back and call it again with confirmed: true once the patient says yes.",
  schema: z.object({
    dateOfBirth: z
      .string()
      .describe("Date of birth as the patient gave it, e.g. '12.04.1985', '12 April 1985' or '1985-04-12'"),
    phone: z
      .string()
      .optional()
      .describe("Phone as the patient gave it; country code optional, spaces and dashes fine"),
    firstName: z.string().optional().describe("Given name, as heard"),
    lastName: z.string().optional().describe("Family name, as heard"),
    confirmed: z
      .boolean()
      .optional()
      .describe("Only true after the patient confirmed a name you read back to them"),
  }),
  execute: async (args, ctx) => {
    const conversation = await db.conversation.findUnique({ where: { id: ctx.conversationId } });
    if (conversation && conversation.failedVerifications >= MAX_FAILED_VERIFICATIONS)
      return {
        verified: false,
        error: "TOO_MANY_ATTEMPTS",
        hint: "Too many failed attempts on this conversation. Stop asking for identifiers and hand over to a human with escalate_to_human.",
      };

    const rawPhone = args.phone ? String(args.phone).trim() : "";
    const firstName = args.firstName ? String(args.firstName).trim() : "";
    const lastName = args.lastName ? String(args.lastName).trim() : "";
    const phone = rawPhone ? parsePhone(rawPhone) : null;
    const dob = parseDateOfBirth(String(args.dateOfBirth));
    const hasName = Boolean(firstName && lastName);

    if (rawPhone && !phone?.suffix && !hasName)
      return {
        verified: false,
        error: "PHONE_UNCLEAR",
        hint: "The phone number did not come through. Read back the digits you think you heard and ask the patient to confirm with a simple yes, rather than making them repeat the whole number.",
      };
    if (!phone?.suffix && !hasName)
      return {
        verified: false,
        error: "NEED_AN_IDENTIFIER",
        hint: "Ask for either the phone number, or the first and last name — whichever the patient finds easier — along with the date of birth.",
      };
    if (dob.candidates.length === 0)
      return {
        verified: false,
        error: "DOB_UNCLEAR",
        hint: "The date of birth did not come through. Read back the date you think you heard, with the month spelled out, and ask them to confirm with a simple yes.",
      };

    // The date of birth is the strong factor either way; the phone or the name
    // then has to agree with it.
    const sameDob = (p: { dateOfBirth: Date | null }) =>
      p.dateOfBirth && dob.candidates.includes(formatInTimeZone(p.dateOfBirth, "UTC", "yyyy-MM-dd"));

    let matches: Awaited<ReturnType<typeof db.patient.findMany>> = [];
    let identifiedBy: "phone" | "name" = "phone";

    if (phone?.suffix) {
      // Match on the trailing digits so the country code and a national trunk
      // zero are both optional for the caller.
      const byPhone = await db.patient.findMany({
        where: { phone: { endsWith: phone.suffix } },
        take: 5,
      });
      matches = byPhone.filter(sameDob);
    }

    if (matches.length === 0 && hasName) {
      identifiedBy = "name";
      const born = await db.patient.findMany({
        where: {
          dateOfBirth: {
            in: dob.candidates.map((d) => new Date(`${d}T00:00:00Z`)),
          },
        },
        take: 50,
      });
      const scored = born
        .map((p) => ({ patient: p, score: fullNameSimilarity({ firstName, lastName }, p) }))
        .filter((c) => c.score >= NAME_CONFIRM_FLOOR)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 1 && scored[1].score >= scored[0].score - 0.05) {
        await logAudit({
          actor: actorFor(ctx),
          action: "VERIFY_AMBIGUOUS",
          entity: "Conversation",
          entityId: ctx.conversationId,
          details: { firstName, lastName },
        });
        return {
          verified: false,
          error: "SEVERAL_MATCHES",
          hint: "Two records fit that name and date of birth. Ask for the phone number instead, so the right person is certain.",
        };
      }

      const best = scored[0];
      if (best && best.score < 1 && !args.confirmed) {
        // Close but not exact: confirm the spelling rather than risk opening
        // someone else's record. Only the NAME is read back — the date of
        // birth is what found this record, so asking about it again would
        // sound like the patient was not listened to.
        return {
          verified: false,
          needsConfirmation: true,
          readBack: { name: `${best.patient.firstName} ${best.patient.lastName}` },
          hint: `The name came through slightly differently. Confirm only the name, in the conversation's language and in one short question, along the lines of "Just to check the spelling — is it <name>?" using readBack.name. Do NOT ask for the date of birth again; it already matched. If the patient says yes, call verify_patient again with the same details plus confirmed: true. If they say no, ask them to spell the surname.`,
        };
      }
      matches = best ? [best.patient] : [];
    }

    const patient = matches.length === 1 ? matches[0] : null;

    if (!patient) {
      await logAudit({
        actor: actorFor(ctx),
        action: "VERIFY_FAILED",
        entity: "Conversation",
        entityId: ctx.conversationId,
        details: { by: identifiedBy, ambiguous: matches.length > 1 },
      });
      await db.conversation.update({
        where: { id: ctx.conversationId },
        data: { failedVerifications: { increment: 1 } },
      });
      return {
        verified: false,
        understood: {
          ...(phone?.digits ? { phone: spellPhone(phone.digits) } : {}),
          ...(hasName ? { name: `${firstName} ${lastName}` } : {}),
          dateOfBirth: dob.candidates.map(spellDate).join(" or "),
        },
        hint:
          matches.length > 1
            ? "More than one record matches. Escalate to a human rather than guessing."
            : "No match — every reading of that date was already tried, so asking for another format will not help. Read the values in `understood` back and ask the patient to correct just the wrong one, or offer the other identifier: if they gave a name, ask for the phone number, and the other way round. If everything is right, they are probably a new patient — offer to register them.",
      };
    }
    await db.conversation.update({
      where: { id: ctx.conversationId },
      data: {
        verified: true,
        verifiedAt: new Date(),
        patientId: patient.id,
        failedVerifications: 0,
      },
    });
    await logAudit({
      actor: actorFor(ctx),
      action: "VERIFY_OK",
      entity: "Patient",
      entityId: patient.id,
      details: { conversationId: ctx.conversationId, identifiedBy },
    });
    return {
      verified: true,
      patientId: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
    };
  },
};

const registerPatient: ToolDef = {
  name: "register_patient",
  description:
    "Register a NEW patient (when no existing record). Collect first name, last name, phone and date of birth ONLY. Never ask for an email address — it is unreliable to capture by voice and the clinic does not need it to book.",
  schema: z.object({
    firstName: z.string().describe("Given name"),
    lastName: z.string().describe("Family name"),
    phone: z.string().describe("Phone as the patient gave it; include the country code if they said one"),
    dateOfBirth: z.string().describe("Date of birth as the patient gave it, in any common wording"),
  }),
  execute: async (args, ctx) => {
    const firstName = String(args.firstName ?? "").trim();
    const lastName = String(args.lastName ?? "").trim();
    // A record is only worth creating if the patient actually gave a name.
    // Placeholders leave an untraceable entry that then looks like a patient
    // with no appointments.
    if (!isRealName(firstName) || !isRealName(lastName))
      return {
        error: "NAME_MISSING",
        hint: "You do not have a usable name. Never invent one and never use a placeholder like 'unknown'. Ask the patient for their first and last name, and if they will not give one, escalate to a human instead of creating a record.",
      };

    const parsedPhone = parsePhone(String(args.phone));
    const parsedDob = parseDateOfBirth(String(args.dateOfBirth));

    if (!parsedPhone.suffix)
      return {
        error: "PHONE_UNCLEAR",
        hint: "The phone number did not come through. Read back the digits you think you heard and ask the patient to confirm with a simple yes.",
      };
    if (!parsedPhone.e164)
      return {
        error: "PHONE_NEEDS_COUNTRY_CODE",
        hint: "A new record needs the country code. Ask which country the number is in, or ask for the number with its country code — do not demand a written format.",
      };
    if (parsedDob.candidates.length === 0)
      return {
        error: "DOB_UNCLEAR",
        hint: "The date of birth did not come through. Read back the date you think you heard, with the month spelled out, and ask them to confirm with a simple yes.",
      };
    if (parsedDob.ambiguous)
      return {
        error: "DOB_AMBIGUOUS",
        mostLikely: spellDate(parsedDob.candidates[0]),
        alternative: spellDate(parsedDob.candidates[1]),
        hint: `Day and month could be read either way and this creates a new record, so confirm once: ask "So that's ${spellDate(parsedDob.candidates[0])}?" — a yes is enough. If they say no, it is ${spellDate(parsedDob.candidates[1])}. Then call this tool again with the month spelled out.`,
      };

    const phone = parsedPhone.e164;
    const existing = await db.patient.findFirst({
      where: { phone: { endsWith: parsedPhone.suffix } },
    });
    if (existing)
      return {
        error: "PHONE_EXISTS",
        hint: "A patient with this phone already exists. Use verify_patient with the phone and date of birth instead.",
      };
    const dob = new Date(`${parsedDob.candidates[0]}T00:00:00Z`);
    const patient = await db.patient.create({
      data: { firstName, lastName, phone, dateOfBirth: dob },
    });
    await db.conversation.update({
      where: { id: ctx.conversationId },
      data: { verified: true, verifiedAt: new Date(), patientId: patient.id },
    });
    await logAudit({
      actor: actorFor(ctx),
      action: "PATIENT_REGISTERED",
      entity: "Patient",
      entityId: patient.id,
    });
    return { patientId: patient.id, registered: true, verified: true };
  },
};

const getMyAppointments: ToolDef = {
  name: "get_my_appointments",
  description:
    "List the verified patient's upcoming appointments (requires verification first). Returns appointmentId and version needed for reschedule/cancel.",
  schema: z.object({}),
  execute: async (_args, ctx) => {
    const { patient } = await requireVerifiedPatient(ctx);
    const appts = await db.appointment.findMany({
      where: { patientId: patient.id, status: { in: ["BOOKED", "CONFIRMED"] }, startsAt: { gte: new Date() } },
      include: { clinic: true, doctor: true, service: true },
      orderBy: { startsAt: "asc" },
    });
    const appointments = appts.map((a) => ({
      appointmentId: a.id,
      version: a.version,
      service: a.service.name,
      doctor: `${a.doctor.title} ${a.doctor.name}`,
      clinic: `${a.clinic.name}, ${a.clinic.city}`,
      city: a.clinic.city,
      when: fmtClinic(a.startsAt, a.clinic.timezone),
      startsAtIso: a.startsAt.toISOString(),
      status: a.status,
      // Real ids so a reschedule can search slots without inventing them.
      serviceId: a.serviceId,
      clinicId: a.clinicId,
      doctorId: a.doctorId,
    }));
    if (appointments.length <= 1) return appointments;
    // Several upcoming visits: name the soonest rather than reading the list out.
    return {
      appointments,
      mostLikely: appointments[0],
      hint: `The patient has ${appointments.length} upcoming visits. Do NOT list them. Ask about the soonest one as a yes/no question ("Your next one is the ${appointments[0].service} in ${appointments[0].city} on ${appointments[0].when} — is that the one?"), and only move to the next if they say no.`,
    };
  },
};

const findSlots: ToolDef = {
  name: "find_slots",
  description:
    "Find available appointment slots for a service. serviceId, clinicId and doctorId must be the opaque ids returned by list_services / list_clinics / list_doctors or by get_my_appointments — never a human-readable name. Optionally filter by start date and time of day. Present 2-3 best options. Each slot has a slotRef used for booking.",
  schema: z.object({
    serviceId: z.string(),
    clinicId: z.string().optional(),
    doctorId: z.string().optional(),
    onDate: z
      .string()
      .optional()
      .describe(
        "Exact calendar day YYYY-MM-DD when the patient named a specific day (\"next Monday\", \"the 15th\"). Resolve it from the CALENDAR block in your instructions — never guess. Returns only that day."
      ),
    fromDate: z
      .string()
      .optional()
      .describe("Earliest date YYYY-MM-DD (clinic local) when the patient gave a range, not one day"),
    timeOfDay: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
    days: z.number().optional().describe("How many days ahead to search (default 7)"),
  }),
  execute: async (args, ctx) => {
    void ctx;
    const exactDay = args.onDate ? String(args.onDate) : undefined;
    const anchor = exactDay ?? (args.fromDate ? String(args.fromDate) : undefined);
    const fromDate = anchor ? new Date(`${anchor}T00:00:00Z`) : undefined;
    const slots = await findAvailableSlots({
      serviceId: String(args.serviceId),
      clinicId: args.clinicId ? String(args.clinicId) : undefined,
      doctorId: args.doctorId ? String(args.doctorId) : undefined,
      fromDate,
      days: exactDay ? 1 : args.days ? Number(args.days) : 7,
      limit: 60,
    });
    const tod = (args.timeOfDay as string) || "any";
    const filtered = slots.filter((s) => {
      if (exactDay && formatInTimeZone(s.startsAt, s.timezone, "yyyy-MM-dd") !== exactDay) return false;
      if (tod === "any") return true;
      const hour = Number(formatInTimeZone(s.startsAt, s.timezone, "H"));
      if (tod === "morning") return hour < 12;
      if (tod === "afternoon") return hour >= 12 && hour < 17;
      return hour >= 17;
    });
    const results = filtered.slice(0, 12).map((s) => ({
      slotRef: slotRef(s.doctorId, s.startsAt),
      when: fmtClinic(s.startsAt, s.timezone),
      startsAtIso: s.startsAt.toISOString(),
      doctor: s.doctorName,
      clinic: `${s.clinicName}, ${s.clinicCity}`,
    }));
    if (results.length === 0) {
      // Never hand the patient a dead end. Widen the search ourselves so the
      // agent always has something concrete to offer: same clinic over the
      // next few weeks first, then the rest of the network.
      const wider = await findAvailableSlots({
        serviceId: String(args.serviceId),
        clinicId: args.clinicId ? String(args.clinicId) : undefined,
        days: 21,
        limit: 40,
      });
      const elsewhere =
        wider.length === 0
          ? await findAvailableSlots({ serviceId: String(args.serviceId), days: 21, limit: 40 })
          : [];
      const fallback = (wider.length > 0 ? wider : elsewhere).slice(0, 3).map((s) => ({
        slotRef: slotRef(s.doctorId, s.startsAt),
        when: fmtClinic(s.startsAt, s.timezone),
        startsAtIso: s.startsAt.toISOString(),
        doctor: s.doctorName,
        clinic: `${s.clinicName}, ${s.clinicCity}`,
      }));

      if (fallback.length === 0)
        return {
          slots: [],
          alternatives: [],
          hint: "Nothing is free for this service anywhere in the next three weeks. Say so plainly and offer to have a colleague call them back with a date.",
        };

      return {
        slots: [],
        searchedDay: exactDay ?? null,
        alternatives: fallback,
        alternativesAt: wider.length > 0 ? "same clinic" : "another clinic",
        hint: `That request has nothing free, but these do. Do NOT offer to hand over to a person and do NOT end the search — say the requested time is taken and offer the nearest alternative in one sentence${wider.length > 0 ? "" : ", mentioning it is at a different clinic"}. Book from the alternatives exactly as you would from a normal slot list.`,
      };
    }
    return results;
  },
};

const bookTool: ToolDef = {
  name: "book_appointment",
  description:
    "Book an appointment for the verified patient into a slot from find_slots. ALWAYS read the details back and get an explicit yes from the patient before calling this.",
  schema: z.object({
    serviceId: z.string(),
    slotRef: z.string().describe("slotRef copied EXACTLY from a find_slots result in this conversation. Never construct or guess it. If you have no fresh slotRef, call find_slots first."),
    notes: z.string().optional(),
    confirmDuplicate: z
      .boolean()
      .optional()
      .describe("Set true only after the patient confirmed they want a second appointment for the same service"),
  }),
  execute: async (args, ctx) => {
    const { conv, patient } = await requireVerifiedPatient(ctx);
    const { doctorId, startsAt } = parseSlotRef(String(args.slotRef));
    try {
      const appt = await bookAppointment({
        patientId: patient.id,
        doctorId,
        serviceId: String(args.serviceId),
        startsAt,
        source: conv.channel === "WIDGET_VOICE" ? "WIDGET_VOICE" : conv.channel === "PHONE" ? "PHONE" : conv.channel === "WHATSAPP" ? "WHATSAPP" : "WIDGET_CHAT",
        notes: args.notes ? String(args.notes) : undefined,
        actor: actorFor(ctx),
        allowDuplicate: Boolean(args.confirmDuplicate),
      });
      return {
        booked: true,
        appointmentId: appt.id,
        service: appt.service.name,
        doctor: `${appt.doctor.title} ${appt.doctor.name}`,
        clinic: `${appt.clinic.name}, ${appt.clinic.city}`,
        address: appt.clinic.address,
        when: fmtClinic(appt.startsAt, appt.clinic.timezone),
        preparation: appt.service.prepInstructions,
      };
    } catch (e) {
      if (e instanceof SchedulingError) return { booked: false, error: e.code, hint: e.message };
      throw e;
    }
  },
};

const rescheduleTool: ToolDef = {
  name: "reschedule_appointment",
  description:
    "Move the verified patient's appointment to a new slot from find_slots. Read the new details back and get explicit confirmation BEFORE calling. Pass the version from get_my_appointments.",
  schema: z.object({
    appointmentId: z.string(),
    version: z.number().describe("Current appointment version (optimistic concurrency)"),
    slotRef: z.string().describe("Target slot copied EXACTLY from a find_slots result in this conversation. Never construct or guess it."),
  }),
  execute: async (args, ctx) => {
    const { patient } = await requireVerifiedPatient(ctx);
    const appt = await db.appointment.findUnique({ where: { id: String(args.appointmentId) } });
    if (!appt || appt.patientId !== patient.id)
      return { error: "NOT_FOUND", hint: "No such appointment for this patient." };
    const { doctorId, startsAt } = parseSlotRef(String(args.slotRef));
    try {
      const { updated, oldSlot } = await rescheduleAppointment({
        appointmentId: appt.id,
        expectedVersion: Number(args.version),
        newStartsAt: startsAt,
        newDoctorId: doctorId,
        actor: actorFor(ctx),
        enforceLeadTime: true,
      });
      // freed old slot -> backfill offers
      createOffersForFreedSlot(oldSlot, "system:backfill").catch((err) =>
        console.error("backfill after reschedule failed", err)
      );
      return {
        rescheduled: true,
        appointmentId: updated.id,
        service: updated.service.name,
        doctor: `${updated.doctor.title} ${updated.doctor.name}`,
        clinic: `${updated.clinic.name}, ${updated.clinic.city}`,
        when: fmtClinic(updated.startsAt, updated.clinic.timezone),
        version: updated.version,
      };
    } catch (e) {
      if (e instanceof SchedulingError) return { rescheduled: false, error: e.code, hint: e.message };
      throw e;
    }
  },
};

const cancelTool: ToolDef = {
  name: "cancel_appointment",
  description:
    "Cancel the verified patient's appointment. Read the appointment details back and get an explicit yes BEFORE calling.",
  schema: z.object({
    appointmentId: z.string(),
    reason: z.string().optional().describe("Short reason in English if the patient gives one"),
  }),
  execute: async (args, ctx) => {
    const { patient } = await requireVerifiedPatient(ctx);
    const appt = await db.appointment.findUnique({ where: { id: String(args.appointmentId) } });
    if (!appt || appt.patientId !== patient.id)
      return { error: "NOT_FOUND", hint: "No such appointment for this patient." };
    try {
      const { cancelled, freedSlot } = await cancelAppointment({
        appointmentId: appt.id,
        reason: args.reason ? String(args.reason) : undefined,
        actor: actorFor(ctx),
        enforceLeadTime: true,
      });
      if (freedSlot) {
        createOffersForFreedSlot(freedSlot, "system:backfill").catch((err) =>
          console.error("backfill after cancel failed", err)
        );
      }
      return {
        cancelled: true,
        appointmentId: cancelled.id,
        service: cancelled.service.name,
        when: fmtClinic(cancelled.startsAt, cancelled.clinic.timezone),
      };
    } catch (e) {
      if (e instanceof SchedulingError) return { cancelled: false, error: e.code, hint: e.message };
      throw e;
    }
  },
};

const setLanguage: ToolDef = {
  name: "set_language",
  description:
    "Call this ONCE, on your very first reply, with the language the patient is actually writing or speaking — not the language you were greeted in. It pins the conversation to that language so colleagues see it and the patient's record stays right. Call it again only if the patient explicitly asks to switch.",
  schema: z.object({
    language: z
      .string()
      .describe(
        `ISO 639-1 code of the language the patient is using: ${SUPPORTED_LANGUAGES.map((l) => `${l.code} (${l.label})`).join(", ")}`
      ),
  }),
  execute: async (args, ctx) => {
    const code = String(args.language).toLowerCase().split("-")[0];
    if (!isSupportedLanguage(code))
      return {
        error: "UNSUPPORTED_LANGUAGE",
        hint: `We do not support ${code}. Continue in English and offer to hand over to a human.`,
      };
    const conv = await db.conversation.update({
      where: { id: ctx.conversationId },
      data: { language: code },
      include: { patient: true },
    });
    // Keep the patient record in step so later channels open in the same language.
    if (conv.patientId && conv.patient?.language !== code) {
      await db.patient.update({ where: { id: conv.patientId }, data: { language: code } });
    }
    await logAudit({
      actor: actorFor(ctx),
      action: "LANGUAGE_SET",
      entity: "Conversation",
      entityId: ctx.conversationId,
      details: { language: code },
    });
    return { language: code, label: languageLabel(code), note: continueInLanguage(code) };
  },
};

const closeConversation: ToolDef = {
  name: "close_conversation",
  description:
    "Call this when the patient confirms they need nothing else — after a goodbye, or when they say the problem is solved. It closes the conversation in the clinic system. On a voice call, call end_call straight after so the line actually hangs up. Never call it while something is still unfinished.",
  schema: z.object({
    summary: z
      .string()
      .describe("One English sentence for staff: what the patient wanted and what happened."),
  }),
  execute: async (args, ctx) => {
    const conv = await db.conversation.findUnique({ where: { id: ctx.conversationId } });
    if (!conv) return { error: "NO_CONVERSATION" };
    // An escalation stays open until a human closes it.
    if (conv.status === "NEEDS_HUMAN")
      return {
        closed: false,
        hint: "This conversation is waiting for a colleague, so it stays open. Say goodbye without closing it.",
      };
    await db.conversation.update({
      where: { id: ctx.conversationId },
      data: { status: "RESOLVED", endedAt: new Date(), summary: String(args.summary).slice(0, 500) },
    });
    await logAudit({
      actor: actorFor(ctx),
      action: "CONVERSATION_CLOSED",
      entity: "Conversation",
      entityId: ctx.conversationId,
      details: { summary: String(args.summary).slice(0, 500) },
    });
    return { closed: true };
  },
};

const escalate: ToolDef = {
  name: "escalate_to_human",
  description:
    "Hand the conversation to a human. MUST be used for: any symptom or clinical question, explicit request for a person, failed identity verification, or anything you cannot handle. Tell the patient a staff member will follow up shortly.",
  schema: z.object({
    kind: z.enum(["clinical", "human_request", "verification_failed", "unsupported", "other"]),
    reason: z.string().describe("One-line summary for the staff"),
  }),
  execute: async (args, ctx) => {
    await db.conversation.update({
      where: { id: ctx.conversationId },
      data: { status: "NEEDS_HUMAN", escalationReason: `${args.kind}: ${args.reason}` },
    });
    await logAudit({
      actor: actorFor(ctx),
      action: "ESCALATED",
      entity: "Conversation",
      entityId: ctx.conversationId,
      details: { kind: String(args.kind), reason: String(args.reason) },
    });
    return {
      escalated: true,
      note: "A staff member has been notified and will follow up. Do not attempt clinical advice.",
    };
  },
};

export const AGENT_TOOLS: ToolDef[] = [
  setLanguage,
  listClinics,
  listServices,
  listDoctors,
  verifyPatient,
  registerPatient,
  getMyAppointments,
  findSlots,
  bookTool,
  rescheduleTool,
  cancelTool,
  escalate,
  closeConversation,
];

export const toolByName = new Map(AGENT_TOOLS.map((t) => [t.name, t]));

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext) {
  const tool = toolByName.get(name);
  if (!tool) return { error: "UNKNOWN_TOOL", hint: `No tool named ${name}` };
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success)
    return { error: "BAD_ARGS", hint: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  try {
    return await tool.execute(parsed.data, ctx);
  } catch (e) {
    if (e instanceof SchedulingError) return { error: e.code, hint: e.message };
    console.error(`tool ${name} failed`, e);
    return { error: "TOOL_FAILED", hint: "Unexpected error, apologize and offer to escalate to a human." };
  }
}
