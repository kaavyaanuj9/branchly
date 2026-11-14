import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  demoAllowed,
  isGmail,
  makeSession,
  readSession,
  SESSION_COOKIE,
  verifyGoogleCredential,
} from "@/lib/auth";

//   POST /api/auth/google  {credential}   sign in with a Google ID token
//   POST /api/auth/demo    {email}        demo sign-in with a Gmail address (local demo only)
//   POST /api/auth/logout
//   GET  /api/auth/me                     who is signed in

async function startSession(user: { email: string; name: string; picture?: string; lab?: string; demo?: boolean }) {
  const { value, maxAge } = makeSession(user);
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return NextResponse.json({ ok: true, user: { email: user.email, name: user.name, picture: user.picture } });
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, string | undefined>;
  try {
    if (action === "google") {
      if (!body.credential) return NextResponse.json({ error: "missing credential" }, { status: 400 });
      const lab = (body.lab || "").trim().slice(0, 120) || undefined;
      return startSession({ ...(await verifyGoogleCredential(body.credential)), lab });
    }
    if (action === "demo") {
      if (!demoAllowed()) return NextResponse.json({ error: "Please sign in with Google." }, { status: 403 });
      const email = (body.email || "").trim().toLowerCase();
      if (!isGmail(email)) return NextResponse.json({ error: "Please enter a Gmail address." }, { status: 400 });
      const name = (body.name || "").trim().slice(0, 80) || email.split("@")[0].replace(/[._]/g, " ");
      const lab = (body.lab || "").trim().slice(0, 120) || undefined;
      return startSession({ email, name, lab, demo: true });
    }
    if (action === "logout") {
      (await cookies()).delete(SESSION_COOKIE);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sign-in failed" }, { status: 401 });
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (action !== "me") return NextResponse.json({ error: "unknown action" }, { status: 404 });
  const user = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  return user ? NextResponse.json({ user }) : NextResponse.json({ user: null }, { status: 401 });
}
