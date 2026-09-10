/**
 * Demo dataset: a European dialysis clinic network (Fresenius Medical Care
 * flavored) with clinics, doctors, services, patients and a realistic
 * appointment book for the next two weeks.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { fromZonedTime } from "date-fns-tz";
import { addDays, format } from "date-fns";

const db = new PrismaClient();

const CLINICS = [
  { name: "FMC NephroCare Berlin Mitte", city: "Berlin", country: "Germany", address: "Friedrichstrasse 110, 10117 Berlin", phone: "+49 30 2094 4100", timezone: "Europe/Berlin" },
  { name: "FMC NephroCare Munich Schwabing", city: "Munich", country: "Germany", address: "Leopoldstrasse 77, 80802 Munich", phone: "+49 89 3838 7200", timezone: "Europe/Berlin" },
  { name: "FMC NephroCare Paris Bastille", city: "Paris", country: "France", address: "12 Rue de la Roquette, 75011 Paris", phone: "+33 1 4700 5511", timezone: "Europe/Paris" },
  { name: "FMC NephroCare Madrid Centro", city: "Madrid", country: "Spain", address: "Calle de Alcala 155, 28009 Madrid", phone: "+34 91 435 2210", timezone: "Europe/Madrid" },
  { name: "FMC NephroCare Milan Navigli", city: "Milan", country: "Italy", address: "Corso San Gottardo 22, 20136 Milan", phone: "+39 02 5810 4400", timezone: "Europe/Rome" },
  { name: "FMC NephroCare Warsaw Mokotow", city: "Warsaw", country: "Poland", address: "ul. Pulawska 145, 02-715 Warsaw", phone: "+48 22 549 3300", timezone: "Europe/Warsaw" },
];

const SERVICES = [
  { name: "Nephrology Consultation", category: "Consultations", durationMin: 30, price: 12000, description: "Initial or regular consultation with a nephrologist: kidney function review, treatment planning, medication adjustments.", prepInstructions: "Bring recent lab results and your current medication list." },
  { name: "Follow-up Consultation", category: "Consultations", durationMin: 20, price: 8000, description: "Short follow-up visit to review progress and adjust the treatment plan.", prepInstructions: "" },
  { name: "Hemodialysis Session", category: "Dialysis", durationMin: 240, price: 35000, description: "In-center hemodialysis treatment supervised by our clinical team.", prepInstructions: "Eat a light meal before the session. Bring something comfortable to wear." },
  { name: "Peritoneal Dialysis Training", category: "Dialysis", durationMin: 90, price: 20000, description: "Hands-on training for home peritoneal dialysis with a specialized nurse.", prepInstructions: "A family member is welcome to join the training." },
  { name: "Home Dialysis Suitability Assessment", category: "Dialysis", durationMin: 60, price: 18000, description: "Assessment of whether home hemodialysis or peritoneal dialysis fits your situation.", prepInstructions: "" },
  { name: "Vascular Access Assessment", category: "Diagnostics", durationMin: 45, price: 15000, description: "Clinical evaluation of fistula, graft or catheter access by a vascular specialist.", prepInstructions: "Wear clothing with easy access to your arms." },
  { name: "Fistula Ultrasound (Doppler)", category: "Diagnostics", durationMin: 30, price: 11000, description: "Doppler ultrasound of the dialysis access to check blood flow and detect stenosis.", prepInstructions: "" },
  { name: "Renal Blood Panel", category: "Laboratory", durationMin: 15, price: 6000, description: "Complete renal profile: creatinine, eGFR, electrolytes, hemoglobin, PTH.", prepInstructions: "Fasting for 8 hours is recommended." },
  { name: "Renal Dietitian Consultation", category: "Support", durationMin: 45, price: 9000, description: "Personalized nutrition plan for chronic kidney disease and dialysis patients.", prepInstructions: "Keep a 3-day food diary before the visit if possible." },
  { name: "Transplant Aftercare Review", category: "Consultations", durationMin: 40, price: 14000, description: "Post-transplant check-up with a transplant nephrologist.", prepInstructions: "Bring your immunosuppressant schedule." },
];

type DoctorSeed = {
  name: string; title: string; specialty: string; bio: string; languages: string[];
  clinicIdx: number; color: string; services: string[]; hours: Array<[number, number, number]>; // weekday, startMin, endMin
};

const WEEK_FULL: Array<[number, number, number]> = [
  [1, 8 * 60, 16 * 60], [2, 8 * 60, 16 * 60], [3, 8 * 60, 16 * 60], [4, 8 * 60, 16 * 60], [5, 8 * 60, 14 * 60],
];
const WEEK_LATE: Array<[number, number, number]> = [
  [1, 10 * 60, 18 * 60], [2, 10 * 60, 18 * 60], [3, 10 * 60, 18 * 60], [4, 10 * 60, 18 * 60], [5, 10 * 60, 16 * 60],
];
const WEEK_SAT: Array<[number, number, number]> = [...WEEK_FULL, [6, 9 * 60, 13 * 60]];

const CONSULT = ["Nephrology Consultation", "Follow-up Consultation", "Renal Blood Panel"];
const DIALYSIS = ["Hemodialysis Session", "Peritoneal Dialysis Training", "Home Dialysis Suitability Assessment"];
const VASCULAR = ["Vascular Access Assessment", "Fistula Ultrasound (Doppler)"];

const DOCTORS: DoctorSeed[] = [
  { name: "Katharina Voss", title: "Dr. med.", specialty: "Nephrology", bio: "15 years in chronic kidney disease management, former senior physician at Charite Berlin. Special focus on early-stage CKD and hypertension.", languages: ["de", "en"], clinicIdx: 0, color: "#0d9488", services: [...CONSULT, "Home Dialysis Suitability Assessment", "Transplant Aftercare Review"], hours: WEEK_FULL },
  { name: "Jonas Brandt", title: "Dr. med.", specialty: "Dialysis Medicine", bio: "Leads the Berlin dialysis unit. Expert in hemodialysis optimization and home dialysis programs.", languages: ["de", "en", "pl"], clinicIdx: 0, color: "#0284c7", services: DIALYSIS, hours: WEEK_SAT },
  { name: "Miriam Scholz", title: "Dr. med.", specialty: "Vascular Surgery", bio: "Vascular access specialist: fistula creation follow-up, Doppler diagnostics, access rescue.", languages: ["de", "en"], clinicIdx: 0, color: "#7c3aed", services: [...VASCULAR, "Renal Blood Panel"], hours: WEEK_LATE },
  { name: "Felix Hartmann", title: "Dr. med.", specialty: "Nephrology", bio: "Munich lead nephrologist. Research background in transplant aftercare, patient lecturer at LMU.", languages: ["de", "en"], clinicIdx: 1, color: "#0d9488", services: [...CONSULT, "Transplant Aftercare Review"], hours: WEEK_FULL },
  { name: "Sofia Lindqvist", title: "Dr.", specialty: "Dialysis Medicine", bio: "Scandinavian-trained dialysis physician; runs the Munich home-dialysis training program.", languages: ["en", "de", "sv"], clinicIdx: 1, color: "#0284c7", services: [...DIALYSIS, "Renal Dietitian Consultation"], hours: WEEK_LATE },
  { name: "Claire Moreau", title: "Dr.", specialty: "Nephrology", bio: "20 years of nephrology practice in Paris. Focus on dialysis planning and conservative kidney care.", languages: ["fr", "en"], clinicIdx: 2, color: "#0d9488", services: [...CONSULT, "Home Dialysis Suitability Assessment"], hours: WEEK_FULL },
  { name: "Antoine Lefevre", title: "Dr.", specialty: "Vascular Surgery", bio: "Vascular access surgeon, performs Doppler assessments and coordinates access maintenance.", languages: ["fr", "en"], clinicIdx: 2, color: "#7c3aed", services: VASCULAR, hours: WEEK_LATE },
  { name: "Lucia Fernandez", title: "Dra.", specialty: "Nephrology", bio: "Madrid senior nephrologist; special interest in diabetic kidney disease and patient education.", languages: ["es", "en"], clinicIdx: 3, color: "#0d9488", services: [...CONSULT, "Transplant Aftercare Review"], hours: WEEK_SAT },
  { name: "Diego Alvarez", title: "Dr.", specialty: "Dialysis Medicine", bio: "Runs the Madrid hemodialysis shifts; certified in peritoneal dialysis training.", languages: ["es", "en"], clinicIdx: 3, color: "#0284c7", services: DIALYSIS, hours: WEEK_FULL },
  { name: "Giulia Romano", title: "Dr.ssa", specialty: "Nephrology", bio: "Milan nephrologist with a focus on nutrition in CKD; works closely with our dietitian team.", languages: ["it", "en"], clinicIdx: 4, color: "#0d9488", services: [...CONSULT, "Renal Dietitian Consultation"], hours: WEEK_FULL },
  { name: "Marco Bianchi", title: "Dr.", specialty: "Vascular Surgery", bio: "Access surgeon and Doppler specialist for the Milan region.", languages: ["it", "en"], clinicIdx: 4, color: "#7c3aed", services: [...VASCULAR, "Renal Blood Panel"], hours: WEEK_LATE },
  { name: "Anna Kowalska", title: "Dr. n. med.", specialty: "Nephrology", bio: "Warsaw lead nephrologist; coordinates dialysis and transplant aftercare for Polish patients.", languages: ["pl", "en", "de"], clinicIdx: 5, color: "#0d9488", services: [...CONSULT, "Transplant Aftercare Review", "Home Dialysis Suitability Assessment"], hours: WEEK_FULL },
  { name: "Piotr Nowak", title: "Dr.", specialty: "Dialysis Medicine", bio: "Hemodialysis unit lead in Warsaw; expert in dialysis adequacy and vascular access care.", languages: ["pl", "en"], clinicIdx: 5, color: "#0284c7", services: [...DIALYSIS, ...VASCULAR], hours: WEEK_SAT },
];

const FIRST = ["Emma", "Liam", "Olivia", "Noah", "Sophia", "Lukas", "Mia", "Leon", "Hannah", "Paul", "Clara", "Jonas", "Lea", "Finn", "Marie", "Hugo", "Chloe", "Louis", "Ines", "Mateo", "Lucia", "Alessandro", "Francesca", "Jan", "Zofia"];
const LAST = ["Weber", "Schmidt", "Fischer", "Wagner", "Becker", "Hoffmann", "Dubois", "Laurent", "Garcia", "Martinez", "Rossi", "Ferrari", "Kowalczyk", "Wisniewski", "Novak", "Keller", "Braun", "Lambert", "Moreno", "Conti", "Zielinski", "Krause", "Fontaine", "Serrano", "Ricci"];
const PHONE_PREFIX = ["+4915", "+4916", "+3361", "+3467", "+3933", "+4869"];

function pad(n: number, len = 7) { return String(n).padStart(len, "0"); }

export async function seed() {
  console.log("Seeding...");
  await db.$transaction([
    db.message.deleteMany(), db.conversation.deleteMany(), db.slotOffer.deleteMany(),
    db.appointment.deleteMany(), db.workingHours.deleteMany(), db.doctorService.deleteMany(),
    db.doctor.deleteMany(), db.service.deleteMany(), db.clinic.deleteMany(),
    db.patient.deleteMany(), db.auditLog.deleteMany(), db.user.deleteMany(), db.setting.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash("demo1234", 10);
  await db.user.createMany({
    data: [
      { email: "admin@demo.clinic", name: "Demo Admin", role: "ADMIN", passwordHash },
      { email: "staff@demo.clinic", name: "Front Desk", role: "STAFF", passwordHash },
    ],
  });

  const clinics: Array<Awaited<ReturnType<typeof db.clinic.create>>> = [];
  for (const c of CLINICS) clinics.push(await db.clinic.create({ data: c }));

  const services = new Map<string, { id: string; durationMin: number }>();
  for (const s of SERVICES) {
    const created = await db.service.create({ data: s });
    services.set(s.name, { id: created.id, durationMin: s.durationMin });
  }

  const doctors = [];
  for (const d of DOCTORS) {
    const doctor = await db.doctor.create({
      data: {
        name: d.name, title: d.title, specialty: d.specialty, bio: d.bio,
        languages: d.languages, color: d.color, clinicId: clinics[d.clinicIdx].id,
        services: { create: d.services.map((name) => ({ serviceId: services.get(name)!.id })) },
        workingHours: { create: d.hours.map(([weekday, startMin, endMin]) => ({ weekday, startMin, endMin })) },
      },
      include: { clinic: true, services: true },
    });
    doctors.push({ ...doctor, seed: d });
  }

  // Patients — first one is the scripted demo patient
  const patients = [];
  patients.push(
    await db.patient.create({
      data: {
        firstName: "Emma", lastName: "Weber", phone: "+4915112345678",
        email: "emma.weber@example.com", dateOfBirth: new Date("1985-04-12T00:00:00Z"),
        language: "en", notes: "Demo patient used in the pitch script.",
      },
    })
  );
  for (let i = 1; i < 25; i++) {
    patients.push(
      await db.patient.create({
        data: {
          firstName: FIRST[i], lastName: LAST[i],
          phone: `${PHONE_PREFIX[i % PHONE_PREFIX.length]}${pad(1000000 + i * 13577)}`,
          email: `${FIRST[i].toLowerCase()}.${LAST[i].toLowerCase()}@example.com`,
          dateOfBirth: new Date(Date.UTC(1950 + ((i * 7) % 45), (i * 3) % 12, 1 + ((i * 11) % 27))),
          language: ["en", "de", "fr", "es", "it", "pl"][i % 6],
        },
      })
    );
  }

  // Patients belong to a home clinic, so nobody ends up booked in three cities
  // at the same hour — a detail clients notice immediately in a demo.
  const patientsByClinic = new Map<string, typeof patients>();
  patients.forEach((patient, index) => {
    const clinic = clinics[index % clinics.length];
    patientsByClinic.set(clinic.id, [...(patientsByClinic.get(clinic.id) ?? []), patient]);
  });
  const clinicCursor = new Map<string, number>();
  const patientBusy = new Map<string, Array<{ s: number; e: number }>>();

  function nextFreePatient(clinicId: string, startsAt: Date, endsAt: Date) {
    const pool = patientsByClinic.get(clinicId) ?? [];
    if (pool.length === 0) return null;
    const start = clinicCursor.get(clinicId) ?? 0;
    for (let step = 0; step < pool.length; step++) {
      const candidate = pool[(start + step) % pool.length];
      const busy = patientBusy.get(candidate.id) ?? [];
      const clash = busy.some((b) => startsAt.getTime() < b.e && endsAt.getTime() > b.s);
      if (clash) continue;
      clinicCursor.set(clinicId, (start + step + 1) % pool.length);
      patientBusy.set(candidate.id, [...busy, { s: startsAt.getTime(), e: endsAt.getTime() }]);
      return candidate;
    }
    return null;
  }

  // Appointment book: for each doctor fill part of the grid over -3..+13 days
  let apptCount = 0;
  const today = new Date();
  for (const doctor of doctors) {
    const tz = doctor.clinic.timezone;
    const doctorServiceNames = doctor.seed.services;
    for (let dayOffset = -3; dayOffset <= 13; dayOffset++) {
      const day = addDays(today, dayOffset);
      const dateStr = format(day, "yyyy-MM-dd");
      const weekday = day.getDay();
      const ranges = doctor.seed.hours.filter(([w]) => w === weekday);
      for (const [, startMin, endMin] of ranges) {
        let cursor = startMin;
        while (cursor < endMin) {
          // pseudo-random but deterministic pattern
          const roll = Math.abs(cursor / 30 + dayOffset * 7 + doctor.name.length) % 10;
          const svcIdx = Math.abs(Math.round(dayOffset + cursor / 30 + doctor.name.length)) % doctorServiceNames.length;
          const svcName = doctorServiceNames[svcIdx];
          const svc = services.get(svcName)!;
          if (roll < 4.5 && cursor + svc.durationMin <= endMin) {
            const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
            const mm = String(cursor % 60).padStart(2, "0");
            const startsAt = fromZonedTime(`${dateStr}T${hh}:${mm}:00`, tz);
            const endsAt = new Date(startsAt.getTime() + svc.durationMin * 60_000);
            const patient = nextFreePatient(doctor.clinicId, startsAt, endsAt);
            if (!patient) {
              cursor += 30;
              continue;
            }
            const isPast = startsAt < today;
            await db.appointment.create({
              data: {
                patientId: patient.id, clinicId: doctor.clinicId, doctorId: doctor.id,
                serviceId: svc.id, startsAt, endsAt,
                status: isPast ? "COMPLETED" : "BOOKED",
                source: ["MANUAL", "WIDGET_CHAT", "PHONE", "WIDGET_VOICE"][apptCount % 4] as "MANUAL",
              },
            });
            apptCount++;
            cursor += svc.durationMin;
            cursor += 30 * ((Math.abs(dayOffset + cursor) % 3) + 1); // gap
          } else {
            cursor += 30;
          }
        }
      }
    }
  }

  // Scripted demo: Emma Weber has a consultation with Dr. Voss in ~6 days at 11:00 Berlin
  const voss = doctors.find((d) => d.name === "Katharina Voss")!;
  const consult = services.get("Nephrology Consultation")!;
  const inSixDays = format(addDays(today, 6), "yyyy-MM-dd");
  const emmaStart = fromZonedTime(`${inSixDays}T11:00:00`, "Europe/Berlin");
  await db.appointment.deleteMany({
    where: { doctorId: voss.id, startsAt: { lt: new Date(emmaStart.getTime() + consult.durationMin * 60000) }, endsAt: { gt: emmaStart } },
  });
  await db.appointment.create({
    data: {
      patientId: patients[0].id, clinicId: voss.clinicId, doctorId: voss.id,
      serviceId: consult.id, startsAt: emmaStart,
      endsAt: new Date(emmaStart.getTime() + consult.durationMin * 60000),
      status: "BOOKED", source: "WIDGET_CHAT",
      notes: "Prefers morning appointments.",
    },
  });

  // A freed slot tomorrow morning (recent cancellation) for the backfill demo
  const tomorrow = format(addDays(today, 1), "yyyy-MM-dd");
  const freedStart = fromZonedTime(`${tomorrow}T09:00:00`, "Europe/Berlin");
  await db.appointment.deleteMany({
    where: { doctorId: voss.id, startsAt: { lt: new Date(freedStart.getTime() + consult.durationMin * 60000) }, endsAt: { gt: freedStart } },
  });
  await db.appointment.create({
    data: {
      patientId: patients[5].id, clinicId: voss.clinicId, doctorId: voss.id,
      serviceId: consult.id, startsAt: freedStart,
      endsAt: new Date(freedStart.getTime() + consult.durationMin * 60000),
      status: "CANCELLED", source: "PHONE", cancelledAt: new Date(),
      cancelReason: "Patient is travelling",
    },
  });

  console.log(`Seeded: ${clinics.length} clinics, ${doctors.length} doctors, ${SERVICES.length} services, ${patients.length} patients, ${apptCount + 2} appointments.`);
}

const invokedDirectly = process.argv[1]?.includes("seed");

if (invokedDirectly) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
