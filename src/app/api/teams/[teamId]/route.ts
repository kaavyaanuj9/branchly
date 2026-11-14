import { NextResponse } from "next/server";
import { getAdminDb, handle, HttpError, loadTeam, requireSession } from "@/lib/firebase/admin";
import { readJson, requireName } from "@/lib/firebase/validate";

type Ctx = RouteContext<"/api/teams/[teamId]">;

// Rename a team (owner only).
export const PATCH = handle(async (request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { teamId } = await ctx.params;
  const { ref, team } = await loadTeam(teamId, session.uid, { owner: true });
  if (team.personal) throw new HttpError(400, "Your personal space can't be renamed");

  const name = requireName((await readJson<{ name: string }>(request)).name, "Team name");
  await ref.update({ name });
  return NextResponse.json({ ok: true });
});

// Delete a team with all its trees and pending invites (owner only).
export const DELETE = handle(async (_request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { teamId } = await ctx.params;
  const { ref, team } = await loadTeam(teamId, session.uid, { owner: true });
  if (team.personal) throw new HttpError(400, "Your personal space can't be deleted");

  const db = getAdminDb();
  const invites = await db.collection("invites").where("teamId", "==", teamId).get();
  const batch = db.batch();
  invites.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  await db.recursiveDelete(ref);
  return NextResponse.json({ ok: true });
});
