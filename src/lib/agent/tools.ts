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
import { parseDateOfBirth, parsePhone } from "@/lib/patient-input";
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

const verifyPatient: ToolDef = {
  name: "verify_patient",
  description:
    "REQUIRED before disclosing appointments or making changes for an existing patient (identity verification). Pass the phone number and date of birth EXACTLY as the patient gave them — any spelling or ordering is understood, so never ask them to repeat it in a particular format. On success the session becomes verified.",
  schema: z.object({
    phone: z
      .string()
      .describe("Phone as the patient gave it; country code optional, spaces and dashes fine"),
    dateOfBirth: z
      .string()
      .describe("Date of birth as the patient gave it, e.g. '12.04.1985', '12 April 1985' or '1985-04-12'"),
  }),
  execute: async (args, ctx) => {
    const phone = parsePhone(String(args.phone));
    const dob = parseDateOfBirth(String(args.dateOfBirth));

    if (!phone.suffix)
      return {
        verified: false,
        error: "PHONE_UNCLEAR",
        hint: "The phone number did not come through. Read back the digits you think you heard and ask the patient to confirm with a simple yes, rather than making them repeat the whole number.",
      };
    if (dob.candidates.length === 0)
      return {
        verified: false,
        error: "DOB_UNCLEAR",
        hint: "The date of birth did not come through. Read back the date you think you heard, with the month spelled out, and ask them to confirm with a simple yes.",
      };

    // Match on the trailing digits so the country code and a national trunk
    // zero are both optional for the caller.
    const byPhone = await db.patient.findMany({
      where: { phone: { endsWith: phone.suffix } },
      take: 5,
    });
    const matches = byPhone.filter(
      (p) =>
        p.dateOfBirth &&
        dob.candidates.includes(formatInTimeZone(p.dateOfBirth, "UTC", "yyyy-MM-dd"))
    );
    const patient = matches.length === 1 ? matches[0] : null;

    if (!patient) {
      await logAudit({
        actor: actorFor(ctx),
        action: "VERIFY_FAILED",
        entity: "Conversation",
        entityId: ctx.conversationId,
        details: { suffix: phone.suffix, ambiguous: matches.length > 1 },
      });
      return {
        verified: false,
        understood: {
          phone: spellPhone(phone.digits),
          dateOfBirth: dob.candidates.map(spellDate).join(" or "),
        },
        hint:
          matches.length > 1
            ? "More than one record matches. Escalate to a human rather than guessing."
            : "No match — every reading of that date was already tried, so asking for another format will not help. Read the values in `understood` back to the patient and ask them to confirm or correct just the wrong one. If both are right, offer to register them as a new patient or escalate to a human.",
      };
    }
    await db.conversation.update({
      where: { id: ctx.conversationId },
      data: { verified: true, patientId: patient.id },
    });
    await logAudit({
      actor: actorFor(ctx),
      action: "VERIFY_OK",
      entity: "Patient",
      entityId: patient.id,
      details: { conversationId: ctx.conversationId },
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
      data: {
        firstName: String(args.firstName),
        lastName: String(args.lastName),
        phone,
        dateOfBirth: dob,
      },
    });
    await db.conversation.update({
      where: { id: ctx.conversationId },
      data: { verified: true, patientId: patient.id },
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
    "Find available appointment slots for a service. Optionally filter by clinic, doctor, start date and time of day. Present 2-3 best options to the patient. Each slot has a slotRef used for booking.",
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
      return {
        slots: [],
        searchedDay: exactDay ?? null,
        hint: exactDay
          ? `Nothing free on ${exactDay}. Tell the patient that exact day is fully booked and offer to look at nearby days (call find_slots again with fromDate).`
          : "No free slots in the searched range. Offer a later date range or another clinic.",
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
