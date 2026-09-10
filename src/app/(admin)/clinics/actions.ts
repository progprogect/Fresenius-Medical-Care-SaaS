"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

const ClinicInput = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  city: z.string().min(1),
  country: z.string().min(1),
  address: z.string().min(3),
  phone: z.string().min(3),
  timezone: z.string().min(3),
  active: z.boolean(),
});

export async function saveClinicAction(input: z.infer<typeof ClinicInput>) {
  await requireSession();
  const parsed = ClinicInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid clinic data" };
  const { id, ...data } = parsed.data;
  if (id) await db.clinic.update({ where: { id }, data });
  else await db.clinic.create({ data });
  revalidatePath("/clinics");
  return { ok: true as const };
}
