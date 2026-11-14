import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { MemberProfile, Team } from "@/lib/types";
import { sampleProject } from "@/lib/sampleData";

// Firebase Admin SDK. Server only: it holds the service-account private key.

export const SESSION_COOKIE = "__session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5; // 5 days (Firebase allows up to 14)

function getAdminApp() {
  if (getApps().length) return getApp();
  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // .env files store the key's newlines as literal "\n".
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  // Optional TreeNode fields are often `undefined`; skip them instead of throwing.
  getFirestore(app).settings({ ignoreUndefinedProperties: true });
  return app;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
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

// ── Route-handler helpers ───────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The signed-in user for this request, or a 401. */
export async function requireSession(): Promise<DecodedIdToken> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) throw new HttpError(401, "Not signed in");
  // The tab says who it thinks it is. Signing in as someone else in another tab
  // replaces the shared cookie, so refuse rather than act as the wrong person.
  const actingUid = (await headers()).get("x-hypotree-uid");
  if (actingUid && actingUid !== session.uid) {
    throw new HttpError(
      409,
      "You signed in as a different account in another tab. Reload this page to continue as that account.",
    );
  }
  return session;
}

/** Wraps a route handler so thrown HttpErrors become JSON error responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      // Let Next.js handle its own control-flow errors (e.g. cookies() bailing
      // out of a build-time prerender) instead of turning them into a 500.
      unstable_rethrow(e);
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error(e);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export function profileOf(session: DecodedIdToken): MemberProfile {
  return {
    name: (session.name as string | undefined) ?? session.email ?? "Unknown",
    email: session.email ?? "",
    photoURL: session.picture ?? null,
  };
}

/** Loads a team and checks the caller belongs to it (optionally as owner). */
export async function loadTeam(teamId: string, uid: string, opts: { owner?: boolean } = {}) {
  const ref = getAdminDb().collection("teams").doc(teamId);
  const snap = await ref.get();
  const team = snap.data() as Omit<Team, "id"> | undefined;
  if (!team || !team.memberIds.includes(uid)) throw new HttpError(404, "Team not found");
  if (opts.owner && team.roles[uid] !== "owner") {
    throw new HttpError(403, "Only the team owner can do that");
  }
  return { ref, team: { id: teamId, ...team } as Team };
}

/**
 * Every user gets a personal team on first sign-in, seeded with the sample tree.
 * Safe to call on every sign-in: it does nothing if the team already exists.
 */
export async function ensurePersonalTeam(session: DecodedIdToken) {
  const db = getAdminDb();
  const teamRef = db.collection("teams").doc(`personal_${session.uid}`);
  if ((await teamRef.get()).exists) return;

  const now = Date.now();
  const batch = db.batch();
  batch.create(teamRef, {
    name: "Personal",
    personal: true,
    roles: { [session.uid]: "owner" },
    memberIds: [session.uid],
    members: { [session.uid]: profileOf(session) },
    createdAt: now,
  });
  const treeRef = teamRef.collection("trees").doc();
  batch.set(treeRef, {
    title: sampleProject.title,
    createdBy: session.uid,
    createdAt: now,
    updatedAt: now,
  });
  sampleProject.nodes.forEach((node, order) => {
    batch.set(treeRef.collection("nodes").doc(node.id), { ...node, order });
  });
  try {
    await batch.commit();
  } catch (e) {
    // Two sign-ins racing: the other one already created it.
    if ((e as { code?: number }).code !== 6 /* ALREADY_EXISTS */) throw e;
  }
}
