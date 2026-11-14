import { NextResponse } from "next/server";
import { handle, HttpError, loadTeam, requireSession } from "@/lib/firebase/admin";

type Ctx = RouteContext<"/api/teams/[teamId]/trees/[treeId]">;

// Delete a tree with all its nodes and chat (owner or editor).
// Done on the server because Firestore clients can't delete subcollections.
export const DELETE = handle(async (_request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { teamId, treeId } = await ctx.params;
  const { ref, team } = await loadTeam(teamId, session.uid);
  if (team.roles[session.uid] === "viewer") throw new HttpError(403, "Viewers can't delete trees");

  const treeRef = ref.collection("trees").doc(treeId);
  if (!(await treeRef.get()).exists) throw new HttpError(404, "Tree not found");
  await ref.firestore.recursiveDelete(treeRef);
  return NextResponse.json({ ok: true });
});
