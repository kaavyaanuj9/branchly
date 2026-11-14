import { NextResponse } from "next/server";
import { getAdminDb, handle, HttpError, loadTeam, requireSession } from "@/lib/firebase/admin";

type Ctx = RouteContext<"/api/teams/[teamId]/invites/[inviteId]">;

// Cancel a pending invite (owner only).
export const DELETE = handle(async (_request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { teamId, inviteId } = await ctx.params;
  await loadTeam(teamId, session.uid, { owner: true });

  const ref = getAdminDb().collection("invites").doc(inviteId);
  const snap = await ref.get();
  if (!snap.exists || snap.get("teamId") !== teamId) throw new HttpError(404, "Invite not found");
  await ref.delete();
  return NextResponse.json({ ok: true });
});
