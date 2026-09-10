"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { acceptOffer, declineOffer, scanForBackfill } from "@/lib/backfill";
import { SchedulingError } from "@/lib/scheduling";

export async function scanBackfillAction() {
  const session = await requireSession();
  const created = await scanForBackfill(`user:${session.id}`);
  revalidatePath("/backfill");
  return { ok: true as const, created };
}

/** Demo helper: simulate the patient tapping "Accept" in WhatsApp. */
export async function simulateOfferResponseAction(token: string, action: "accept" | "decline") {
  await requireSession();
  try {
    if (action === "accept") await acceptOffer(token, "patient:whatsapp-demo");
    else await declineOffer(token, "patient:whatsapp-demo");
    revalidatePath("/backfill");
    return { ok: true as const };
  } catch (err) {
    if (err instanceof SchedulingError) return { ok: false as const, error: err.message };
    console.error(err);
    return { ok: false as const, error: "Unexpected error" };
  }
}
