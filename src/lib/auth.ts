import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Sign-in for HypoTree. Two ways in:
//  - "Sign in with Google" (real): set GOOGLE_CLIENT_ID. Google's ID token is checked
//    server-side (signature, audience, expiry, verified email) before a session is made.
//  - Demo sign-in with a Gmail address (no password), only while GOOGLE_CLIENT_ID is unset
//    or AUTH_DEMO=1. Fine for a local hackathon demo; never for anything shared.
// The session is a signed cookie (HMAC-SHA256 with AUTH_SECRET).

export const SESSION_COOKIE = "hypotree_session";
const MAX_AGE_S = 60 * 60 * 24 * 14;

export interface SessionUser {
  email: string;
  name: string;
  picture?: string;
  /** true when signed in with the demo (unverified) Gmail form */
  demo?: boolean;
  exp: number;
}

// Without AUTH_SECRET, sessions last until the server restarts. The fallback lives on
// globalThis so every route bundle in this server process signs with the same key.
const g = globalThis as typeof globalThis & { __hypotreeAuthSecret?: string };
const SECRET = process.env.AUTH_SECRET || (g.__hypotreeAuthSecret ??= randomBytes(32).toString("hex"));

export const googleClientId = () => process.env.GOOGLE_CLIENT_ID?.trim() || "";
export const demoAllowed = () => !googleClientId() || process.env.AUTH_DEMO === "1";

const sign = (data: string) => createHmac("sha256", SECRET).update(data).digest("base64url");

export function makeSession(user: Omit<SessionUser, "exp">): { value: string; maxAge: number } {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S })).toString(
    "base64url",
  );
  return { value: `${payload}.${sign(payload)}`, maxAge: MAX_AGE_S };
}

export function readSession(value: string | undefined): SessionUser | null {
  if (!value) return null;
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser;
    return user.exp > Date.now() / 1000 ? user : null;
  } catch {
    return null;
  }
}

/** Check a Google ID token with Google and return who it belongs to. */
export async function verifyGoogleCredential(credential: string): Promise<Omit<SessionUser, "exp">> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Google did not accept this sign-in. Please try again.");
  const t = (await res.json()) as Record<string, string>;
  if (t.aud !== googleClientId()) throw new Error("This sign-in was meant for a different app.");
  if (t.email_verified !== "true" || !t.email) throw new Error("Your Google email is not verified.");
  if (Number(t.exp) < Date.now() / 1000) throw new Error("This sign-in has expired. Please try again.");
  return { email: t.email, name: t.name || t.email.split("@")[0], picture: t.picture };
}

export const isGmail = (email: string) => /^[a-z0-9._%+-]+@(gmail|googlemail)\.com$/i.test(email.trim());
