import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyCredentials } from "@/lib/auth";

const Body = z.object({ email: z.string(), password: z.string() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  await createSession(user);
  return NextResponse.json({ ok: true, user: { name: user.name, role: user.role } });
}
