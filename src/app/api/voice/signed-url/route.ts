import { NextResponse } from "next/server";
import { getSignedUrl } from "@/lib/elevenlabs";

export async function GET() {
  try {
    const signedUrl = await getSignedUrl();
    return NextResponse.json({ signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
