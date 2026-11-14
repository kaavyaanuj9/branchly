import { NextResponse } from "next/server";
import {
  ensurePersonalTeam,
  getAdminAuth,
  handle,
  profileOf,
  requireSession,
} from "@/lib/firebase/admin";

// Signs the browser's Firebase SDK in as the session-cookie user, so it can
// read and write Firestore under the security rules.
export const GET = handle(async () => {
  const session = await requireSession();
  await ensurePersonalTeam(session);
  const token = await getAdminAuth().createCustomToken(session.uid);
  return NextResponse.json({ uid: session.uid, token, profile: profileOf(session) });
});
