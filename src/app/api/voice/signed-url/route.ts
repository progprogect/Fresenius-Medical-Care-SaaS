import { NextResponse } from "next/server";
import { getSignedUrl } from "@/lib/elevenlabs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  try {
    const result = await getSignedUrl(
      params.get("conversationId") ?? undefined,
      params.get("clientToken") ?? undefined
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
