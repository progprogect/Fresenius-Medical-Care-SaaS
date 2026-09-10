import { NextResponse } from "next/server";
import { getSignedUrl } from "@/lib/elevenlabs";

export async function GET(req: Request) {
  const existing = new URL(req.url).searchParams.get("conversationId") ?? undefined;
  try {
    const { signedUrl, dynamicVariables, languages, conversationId } = await getSignedUrl(existing);
    return NextResponse.json({ signedUrl, dynamicVariables, languages, conversationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
