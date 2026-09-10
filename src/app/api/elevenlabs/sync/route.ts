import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { syncElevenLabsAgent } from "@/lib/elevenlabs";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await syncElevenLabsAgent();
    await logAudit({
      actor: `user:${session.id}`,
      action: result.created ? "VOICE_AGENT_CREATED" : "VOICE_AGENT_SYNCED",
      entity: "Setting",
      entityId: "agent",
      details: { agentId: result.agentId },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
