import { NextResponse } from "next/server";
import {
  getAdminAuth,
  getAdminDb,
  handle,
  HttpError,
  loadTeam,
  profileOf,
  requireSession,
} from "@/lib/firebase/admin";
import { readJson, requireMemberRole } from "@/lib/firebase/validate";
import type { Invite } from "@/lib/types";

type Ctx = RouteContext<"/api/teams/[teamId]/invites">;

// Pending invites this team has sent (owner only).
export const GET = handle(async (_request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { teamId } = await ctx.params;
  await loadTeam(teamId, session.uid, { owner: true });

  const snap = await getAdminDb().collection("invites").where("teamId", "==", teamId).get();
  const invites = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Invite)
    .sort((a, b) => a.createdAt - b.createdAt);
  return NextResponse.json({ invites });
});

// Invite an existing HypoTree user by their Google email (owner only).
export const POST = handle(async (request: Request, ctx: Ctx) => {
  const session = await requireSession();
  const { teamId } = await ctx.params;
  const { team } = await loadTeam(teamId, session.uid, { owner: true });
  if (team.personal) {
    throw new HttpError(400, "Create a team to collaborate. Your personal space is just for you.");
  }

  const body = await readJson<{ email: string; role: string }>(request);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) throw new HttpError(400, "Email is required");
  const role = requireMemberRole(body.role);

  const invitee = await getAdminAuth()
    .getUserByEmail(email)
    .catch(() => null);
  if (!invitee) {
    throw new HttpError(
      404,
      "No HypoTree user has that email. Ask them to sign in once, then invite them.",
    );
  }
  if (team.memberIds.includes(invitee.uid)) {
    throw new HttpError(409, "They're already on this team");
  }

  // One invite per person per team: the id makes duplicates impossible.
  const ref = getAdminDb().collection("invites").doc(`${teamId}_${invitee.uid}`);
  const invite: Omit<Invite, "id"> = {
    teamId,
    teamName: team.name,
    role,
    inviteeUid: invitee.uid,
    inviteeEmail: email,
    invitedBy: { uid: session.uid, name: profileOf(session).name },
    createdAt: Date.now(),
  };
  try {
    await ref.create(invite);
  } catch (e) {
    if ((e as { code?: number }).code === 6)
      throw new HttpError(409, "They've already been invited");
    throw e;
  }
  return NextResponse.json({ invite: { id: ref.id, ...invite } });
});
