import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, handle, HttpError, profileOf, requireSession } from "@/lib/firebase/admin";
import { readJson } from "@/lib/firebase/validate";
import type { Invite } from "@/lib/types";

type Ctx = RouteContext<"/api/invitations/[inviteId]">;

// Accept or decline an invite addressed to you.
export const POST = handle(async (request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { inviteId } = await ctx.params;
  const { action } = await readJson<{ action: string }>(request);
  if (action !== "accept" && action !== "decline") {
    throw new HttpError(400, "Action must be accept or decline");
  }

  const db = getAdminDb();
  const inviteRef = db.collection("invites").doc(inviteId);

  const teamId = await db.runTransaction(async (tx) => {
    const snap = await tx.get(inviteRef);
    const invite = snap.data() as Omit<Invite, "id"> | undefined;
    if (!invite) throw new HttpError(404, "This invite was cancelled or already answered");
    if (invite.inviteeUid !== session.uid) {
      throw new HttpError(
        403,
        `This invite is for ${invite.inviteeEmail}, but you're signed in as ${session.email ?? "another account"}. Sign out and sign in as ${invite.inviteeEmail} to accept it.`,
      );
    }

    if (action === "accept") {
      const teamRef = db.collection("teams").doc(invite.teamId);
      if (!(await tx.get(teamRef)).exists) throw new HttpError(410, "That team no longer exists");
      tx.update(teamRef, {
        memberIds: FieldValue.arrayUnion(session.uid),
        [`roles.${session.uid}`]: invite.role,
        [`members.${session.uid}`]: profileOf(session),
      });
    }
    tx.delete(inviteRef);
    return invite.teamId;
  });

  return NextResponse.json({ ok: true, teamId });
});
