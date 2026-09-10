import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listVoices } from "@/lib/elevenlabs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ voices: await listVoices() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
