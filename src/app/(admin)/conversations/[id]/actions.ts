"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function resolveConversationAction(conversationId: string) {
  const session = await requireSession();
  await db.conversation.update({
    where: { id: conversationId },
    data: { status: "RESOLVED", endedAt: new Date() },
  });
  await logAudit({
    actor: `user:${session.id}`,
    action: "CONVERSATION_RESOLVED",
    entity: "Conversation",
    entityId: conversationId,
  });
  revalidatePath(`/conversations/${conversationId}`);
  revalidatePath("/conversations");
  return { ok: true };
}
