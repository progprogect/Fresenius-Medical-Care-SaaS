import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const SAMPLE =
  "Hello, this is Nora from Fresenius Medical Care. I can help you book, move or cancel an appointment.";

/** Streams a short spoken sample so staff can compare voices before saving. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const voiceId = new URL(req.url).searchParams.get("voiceId");
  if (!voiceId) return NextResponse.json({ error: "voiceId required" }, { status: 400 });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not set" }, { status: 503 });

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: SAMPLE, model_id: "eleven_turbo_v2" }),
      cache: "no-store",
    }
  );
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "preview failed" }, { status: 502 });
  }
  return new Response(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
