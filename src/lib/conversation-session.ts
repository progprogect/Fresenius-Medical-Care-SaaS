import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { Conversation } from "@prisma/client";

/**
 * A conversation id identifies a thread; it does not prove you started it.
 * Widget callers therefore hold a capability token issued when the
 * conversation is created, and must present it to resume one. Without this,
 * anyone who learns an id — from a shared browser, an access log, or a URL —
 * could read and cancel that patient's appointments.
 */
export function newClientToken() {
  return randomBytes(24).toString("base64url");
}

/** How long a verified identity survives without a new turn. */
export const VERIFICATION_TTL_MS = 30 * 60 * 1000;

/** Cap on wrong answers to the second factor before we stop guessing games. */
export const MAX_FAILED_VERIFICATIONS = 5;

/**
 * Resolves the conversation a public caller may act on. Returns null when the
 * pair does not match, so the caller is given a fresh conversation instead of
 * somebody else's.
 */
export async function resolveOwnedConversation(
  conversationId: string | null | undefined,
  clientToken: string | null | undefined
): Promise<Conversation | null> {
  if (!conversationId || !clientToken) return null;
  const conversation = await db.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return null;
  if (!conversation.clientToken || conversation.clientToken !== clientToken) return null;
  return conversation;
}

/** Drops a verified identity that has gone stale, so it cannot be inherited. */
export async function expireStaleVerification(conversation: Conversation) {
  if (!conversation.verified) return conversation;
  const since = conversation.verifiedAt ?? conversation.startedAt;
  if (Date.now() - since.getTime() <= VERIFICATION_TTL_MS) return conversation;
  return db.conversation.update({
    where: { id: conversation.id },
    data: { verified: false, verifiedAt: null },
  });
}

/**
 * A conversation the assistant already closed is finished. Appending to it
 * would leave staff looking at a resolved thread that keeps growing, with
 * messages timestamped after it ended.
 */
export function isReusable(conversation: Conversation) {
  return conversation.status !== "RESOLVED";
}

export async function createWidgetConversation(channel: "WIDGET_CHAT" | "WIDGET_VOICE") {
  return db.conversation.create({ data: { channel, clientToken: newClientToken() } });
}
