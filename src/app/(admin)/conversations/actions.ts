"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * Takes an escalated conversation off the queue. Claiming is first-come:
 * if a colleague already holds it, the caller is told who, rather than
 * silently stealing the patient from them.
 */
export async function claimConversationAction(conversationId: string): Promise<Result> {
  const session = await requireSession();
  const conv = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { assignedTo: true },
  });
  if (!conv) return { ok: false, error: "Conversation not found" };
  if (conv.assignedToId && conv.assignedToId !== session.id)
    return { ok: false, error: `Already taken by ${conv.assignedTo?.name ?? "a colleague"}` };
  if (conv.assignedToId === session.id) return { ok: true, message: "Already yours" };

  const claimed = await db.conversation.updateMany({
    where: { id: conversationId, assignedToId: null },
    data: { assignedToId: session.id, assignedAt: new Date() },
  });
  if (claimed.count === 0) {
    const fresh = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { assignedTo: true },
    });
    return { ok: false, error: `Already taken by ${fresh?.assignedTo?.name ?? "a colleague"}` };
  }

  await logAudit({
    actor: `user:${session.id}`,
    action: "CONVERSATION_CLAIMED",
    entity: "Conversation",
    entityId: conversationId,
  });
  revalidatePath("/conversations");
  revalidatePath(`/conversations/${conversationId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "You have this conversation" };
}

/** Puts a claimed conversation back in the queue. */
export async function releaseConversationAction(conversationId: string): Promise<Result> {
  const session = await requireSession();
  const conv = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) return { ok: false, error: "Conversation not found" };
  if (conv.assignedToId && conv.assignedToId !== session.id && session.role !== "ADMIN")
    return { ok: false, error: "Only the person holding it, or an admin, can release it" };

  await db.conversation.update({
    where: { id: conversationId },
    data: { assignedToId: null, assignedAt: null },
  });
  await logAudit({
    actor: `user:${session.id}`,
    action: "CONVERSATION_RELEASED",
    entity: "Conversation",
    entityId: conversationId,
  });
  revalidatePath("/conversations");
  revalidatePath(`/conversations/${conversationId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Back in the queue" };
}

/** Closes an escalation once a human has dealt with it. */
export async function resolveConversationAction(conversationId: string): Promise<Result> {
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
  revalidatePath("/conversations");
  revalidatePath(`/conversations/${conversationId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Marked resolved" };
}
