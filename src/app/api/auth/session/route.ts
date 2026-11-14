import { NextResponse } from "next/server";
import {
  ensurePersonalTeam,
  getAdminAuth,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/firebase/admin";

// Swaps the short-lived Firebase ID token from the Google popup
// for a long-lived, httpOnly session cookie.
export async function POST(request: Request) {
  const { idToken } = (await request.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  const auth = getAdminAuth();
  try {
    const decoded = await auth.verifyIdToken(idToken);
    // Only accept tokens from a sign-in that just happened.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: "Sign-in is too old, please retry" }, { status: 401 });
    }

    // Also retried on every page load by /api/auth/token, so a failure here isn't fatal.
    await ensurePersonalTeam(decoded).catch((e) => console.error("ensurePersonalTeam failed", e));

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid sign-in" }, { status: 401 });
  }
}
