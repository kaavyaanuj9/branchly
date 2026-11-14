"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { useCurrentUser } from "@/lib/firebase/FirebaseProvider";
import { api, useMyInvites } from "@/lib/teams";
import type { Invite } from "@/lib/types";
import { Button, Card, ErrorText, Page, RoleBadge, errorMessage, timeAgo } from "./ui";

/** `/invites`: team invitations waiting for you, updated live. */
export function InvitesInbox() {
  const { uid } = useCurrentUser();
  const { data: invites, loading } = useMyInvites(uid);

  return (
    <Page crumbs={[{ label: "Team invites" }]}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team invites</h1>
        <p className="mt-1 text-sm text-slate-500">
          When a team owner invites you, it shows up here. Accept to join their research team.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading invites…</p>
      ) : invites.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500">
          <Inbox className="size-8 text-slate-300" />
          No pending invites.
          <Link href="/" className="font-medium text-indigo-700 hover:underline">
            Back to your teams
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <InviteRow key={invite.id} invite={invite} />
          ))}
        </div>
      )}
    </Page>
  );
}

function InviteRow({ invite }: { invite: Invite }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");

  async function respond(action: "accept" | "decline") {
    setBusy(action);
    setError("");
    try {
      await api(`/api/invitations/${invite.id}`, "POST", { action });
      if (action === "accept") router.push(`/teams/${invite.teamId}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
          {invite.teamName} <RoleBadge role={invite.role} />
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          {invite.invitedBy.name} invited you {timeAgo(invite.createdAt)}
        </p>
        <ErrorText>{error}</ErrorText>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={busy !== null} onClick={() => respond("decline")}>
          <X className="size-3.5" /> Decline
        </Button>
        <Button disabled={busy !== null} onClick={() => respond("accept")}>
          <Check className="size-3.5" /> {busy === "accept" ? "Joining…" : "Accept"}
        </Button>
      </div>
    </Card>
  );
}
