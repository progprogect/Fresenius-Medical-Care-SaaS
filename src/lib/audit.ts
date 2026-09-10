import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function logAudit(input: {
  actor: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
}) {
  try {
    await db.auditLog.create({ data: input });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
