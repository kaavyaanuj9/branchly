import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

// Firebase Admin SDK. Server only: it holds the service-account private key.

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5; // 5 days (Firebase allows up to 14)

export function getAdminAuth() {
  const app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // .env files store the key's newlines as literal "\n".
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
  return getAuth(app);
}

// Returns the decoded session, or null if the cookie is missing, expired or forged.
export async function verifySession(cookie: string | undefined): Promise<DecodedIdToken | null> {
  if (!cookie) return null;
  try {
    return await getAdminAuth().verifySessionCookie(cookie);
  } catch {
    return null;
  }
}
