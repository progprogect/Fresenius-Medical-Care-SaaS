"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const CreateUserInput = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "STAFF"]),
});

export async function createUserAction(input: z.infer<typeof CreateUserInput>) {
  const admin = await requireAdmin();
  const parsed = CreateUserInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Check the fields: valid email and a password of 8+ characters are required" };
  const email = parsed.data.email.toLowerCase();
  const exists = await db.user.findUnique({ where: { email } });
  if (exists) return { ok: false as const, error: "A user with this email already exists" };
  const user = await db.user.create({
    data: {
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  await logAudit({
    actor: `user:${admin.id}`,
    action: "USER_CREATED",
    entity: "User",
    entityId: user.id,
    details: { email, role: parsed.data.role },
  });
  revalidatePath("/settings/users");
  return { ok: true as const };
}

export async function deleteUserAction(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return { ok: false as const, error: "You cannot delete your own account" };
  await db.user.delete({ where: { id: userId } });
  await logAudit({
    actor: `user:${admin.id}`,
    action: "USER_DELETED",
    entity: "User",
    entityId: userId,
  });
  revalidatePath("/settings/users");
  return { ok: true as const };
}
