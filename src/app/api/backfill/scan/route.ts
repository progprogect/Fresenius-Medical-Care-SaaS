import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { scanForBackfill } from "@/lib/backfill";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const created = await scanForBackfill(`user:${session.id}`);
  return NextResponse.json({ created });
}
