"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, GitBranch, Inbox, Plus, Users } from "lucide-react";
import { useCurrentUser } from "@/lib/firebase/FirebaseProvider";
import { api, importLegacyTree, useMyInvites, useMyTeams, useTrees } from "@/lib/teams";
import type { Team } from "@/lib/types";
import { Avatar } from "@/components/UserMenu";
import { Button, Card, ErrorText, Page, RoleBadge, errorMessage, inputClass, timeAgo } from "./ui";

/** `/`: every team you belong to, with its trees. */
export function TeamsHome() {
  const { uid } = useCurrentUser();
  const { data: teams, loading } = useMyTeams(uid);
  const { data: invites } = useMyInvites(uid);

  // Move a tree saved in this browser before teams existed into the personal space.
  const importStarted = useRef(false);
  useEffect(() => {
    if (importStarted.current) return;
    importStarted.current = true;
    importLegacyTree(uid).catch((e) => console.error("Couldn't import your local tree", e));
  }, [uid]);

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your research teams</h1>
          <p className="mt-1 text-sm text-slate-500">
            Invite collaborators to a team and work on its hypothesis trees together, live.
          </p>
        </div>
        <NewTeamForm />
      </div>

      {invites.length > 0 && (
        <Link
          href="/invites"
          className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm text-indigo-900 transition hover:bg-indigo-100"
        >
          <Inbox className="size-4" />
          You have {invites.length} pending team invite{invites.length === 1 ? "" : "s"}.
          <span className="ml-auto flex items-center gap-1 font-semibold">
            Review <ChevronRight className="size-4" />
          </span>
        </Link>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading your teams…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}
    </Page>
  );
}

function NewTeamForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: string }>("/api/teams", "POST", { name });
      router.push(`/teams/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New team
      </Button>
    );
  }
  return (
    <form onSubmit={create} className="flex w-full flex-col gap-2 sm:w-auto">
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name, e.g. Smith Lab"
          maxLength={80}
          className={`${inputClass} sm:w-64`}
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          Create
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function TeamCard({ team }: { team: Team }) {
  const { uid } = useCurrentUser();
  const { data: trees, loading } = useTrees(team.id);
  const members = team.memberIds.map((id) => team.members[id]).filter(Boolean);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/teams/${team.id}`} className="min-w-0 group">
          <h2 className="flex items-center gap-2 truncate text-[16px] font-semibold group-hover:text-indigo-700">
            {team.personal ? "Personal" : team.name}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
            {team.personal ? (
              "Just you"
            ) : (
              <>
                <Users className="size-3.5" /> {members.length} member
                {members.length === 1 ? "" : "s"}
              </>
            )}
          </p>
        </Link>
        <div className="flex items-center gap-2">
          {!team.personal && (
            <div className="flex -space-x-2">
              {members.slice(0, 4).map((m) => (
                <span key={m.email} className="rounded-full ring-2 ring-white" title={m.name}>
                  <Avatar name={m.name} photoURL={m.photoURL} size="size-6" />
                </span>
              ))}
            </div>
          )}
          {!team.personal && <RoleBadge role={team.roles[uid]} />}
        </div>
      </div>

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
        {loading && <li className="px-3 py-2.5 text-sm text-slate-400">Loading trees…</li>}
        {!loading && trees.length === 0 && (
          <li className="px-3 py-2.5 text-sm text-slate-400">No trees yet.</li>
        )}
        {trees.slice(0, 5).map((tree) => (
          <li key={tree.id}>
            <Link
              href={`/teams/${team.id}/trees/${tree.id}`}
              className="flex items-center gap-2 px-3 py-2.5 text-sm transition hover:bg-slate-50"
            >
              <GitBranch className="size-4 shrink-0 text-indigo-500" />
              <span className="truncate text-slate-800">{tree.title}</span>
              <span className="ml-auto shrink-0 text-xs text-slate-400">
                {tree.progress && tree.progress.total > 0 && (
                  <span className="mr-2 font-medium text-emerald-700">
                    {tree.progress.done}/{tree.progress.total} done
                  </span>
                )}
                {timeAgo(tree.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href={`/teams/${team.id}`}
        className="flex items-center gap-1 self-start text-[13px] font-medium text-indigo-700 hover:underline"
      >
        {trees.length > 5 ? `All ${trees.length} trees` : "Open team"}
        <ChevronRight className="size-3.5" />
      </Link>
    </Card>
  );
}
