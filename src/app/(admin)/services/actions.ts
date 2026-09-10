"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";

const ServiceInput = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  category: z.string().min(2),
  durationMin: z.number().int().min(5).max(600),
  priceEur: z.number().min(0),
  description: z.string(),
  prepInstructions: z.string(),
  active: z.boolean(),
});

export async function saveServiceAction(input: z.infer<typeof ServiceInput>) {
  await requireSession();
  const parsed = ServiceInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid service data" };
  const { id, priceEur, ...rest } = parsed.data;
  const data = { ...rest, price: Math.round(priceEur * 100) };
  if (id) await db.service.update({ where: { id }, data });
  else await db.service.create({ data });
  revalidatePath("/services");
  return { ok: true as const };
}
