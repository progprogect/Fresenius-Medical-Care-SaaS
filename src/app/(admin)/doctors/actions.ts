"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

const HoursRow = z.object({
  weekday: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1440),
  endMin: z.number().int().min(0).max(1440),
});

const DoctorInput = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  title: z.string().min(1),
  specialty: z.string().min(2),
  bio: z.string(),
  languages: z.array(z.string()),
  color: z.string(),
  clinicId: z.string().min(1),
  active: z.boolean(),
  serviceIds: z.array(z.string()),
  hours: z.array(HoursRow),
});

export async function saveDoctorAction(input: z.infer<typeof DoctorInput>) {
  await requireSession();
  const parsed = DoctorInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid doctor data" };
  const { id, serviceIds, hours, ...data } = parsed.data;
  const badRange = hours.find((h) => h.endMin <= h.startMin);
  if (badRange) return { ok: false as const, error: "Working hours: end must be after start" };

  if (id) {
    await db.$transaction([
      db.doctor.update({ where: { id }, data }),
      db.doctorService.deleteMany({ where: { doctorId: id } }),
      db.doctorService.createMany({ data: serviceIds.map((serviceId) => ({ doctorId: id, serviceId })) }),
      db.workingHours.deleteMany({ where: { doctorId: id } }),
      db.workingHours.createMany({ data: hours.map((h) => ({ ...h, doctorId: id })) }),
    ]);
  } else {
    await db.doctor.create({
      data: {
        ...data,
        services: { create: serviceIds.map((serviceId) => ({ serviceId })) },
        workingHours: { create: hours },
      },
    });
  }
  revalidatePath("/doctors");
  return { ok: true as const };
}
