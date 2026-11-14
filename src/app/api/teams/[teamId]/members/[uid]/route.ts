import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { handle, HttpError, loadTeam, requireSession } from "@/lib/firebase/admin";
import { readJson, requireMemberRole } from "@/lib/firebase/validate";

type Ctx = RouteContext<"/api/teams/[teamId]/members/[uid]">;

// Change a member's role (owner only).
export const PATCH = handle(async (request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { teamId, uid } = await ctx.params;
  const { ref, team } = await loadTeam(teamId, session.uid, { owner: true });
  if (!team.memberIds.includes(uid)) throw new HttpError(404, "Member not found");
  if (team.roles[uid] === "owner") throw new HttpError(400, "The owner's role can't be changed");

  const role = requireMemberRole((await readJson<{ role: string }>(request)).role);
  await ref.update({ [`roles.${uid}`]: role });
  return NextResponse.json({ ok: true });
});

// Remove a member (owner), or leave the team (yourself).
export const DELETE = handle(async (_request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { teamId, uid } = await ctx.params;
  const leaving = uid === session.uid;
  const { ref, team } = await loadTeam(teamId, session.uid, { owner: !leaving });
  if (!team.memberIds.includes(uid)) throw new HttpError(404, "Member not found");
  if (team.roles[uid] === "owner") {
    throw new HttpError(400, "The owner can't leave. Delete the team instead.");
  }

  await ref.update({
    memberIds: FieldValue.arrayRemove(uid),
    [`roles.${uid}`]: FieldValue.delete(),
    [`members.${uid}`]: FieldValue.delete(),
  });
  return NextResponse.json({ ok: true });
});
