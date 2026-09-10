import { NextResponse } from "next/server";
import { getSignedUrl } from "@/lib/elevenlabs";

export async function GET() {
  try {
    const { signedUrl, dynamicVariables, languages } = await getSignedUrl();
    return NextResponse.json({ signedUrl, dynamicVariables, languages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
