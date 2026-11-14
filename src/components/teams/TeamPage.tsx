"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, GitBranch, LogOut, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { useCurrentUser } from "@/lib/firebase/FirebaseProvider";
import { api, createTree, renameTree, useTeam, useTrees } from "@/lib/teams";
import type { Invite, Role, Team, TreeMeta } from "@/lib/types";
import { Avatar } from "@/components/UserMenu";
import { AvatarStack, ProgressBar } from "@/components/Assignment";
import { TeamContext } from "@/components/teamContext";
import {
  Button,
  Card,
  CenteredSpinner,
  ErrorText,
  NotFound,
  Page,
  RoleBadge,
  errorMessage,
  inputClass,
  timeAgo,
} from "./ui";

/** `/teams/[teamId]`: a team's trees and members. */
export function TeamPage({ teamId }: { teamId: string }) {
  const { uid } = useCurrentUser();
  const { data: team, loading } = useTeam(teamId);

  if (loading) return <CenteredSpinner />;
  if (!team) return <NotFound what="team" />;

  const role = team.roles[uid];
  const isOwner = role === "owner";
  const canEdit = role === "owner" || role === "editor";
  const name = team.personal ? "Personal" : team.name;

  return (
    <TeamContext.Provider value={{ team, uid }}>
      <Page crumbs={[{ label: name }]}>
        <TeamTitle team={team} isOwner={isOwner} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <TreesCard team={team} canEdit={canEdit} />
          {team.personal ? (
            <Card className="space-y-2 text-sm text-slate-600">
              <h2 className="text-[15px] font-semibold text-slate-900">Just you</h2>
              <p>
                This is your personal space. To work with others, create a team from the home page
                and invite them.
              </p>
              <Link href="/" className="inline-block font-medium text-indigo-700 hover:underline">
                Back to your teams
              </Link>
            </Card>
          ) : (
            <div className="space-y-6">
              <MembersCard team={team} isOwner={isOwner} />
              <LeaveOrDelete team={team} isOwner={isOwner} />
            </div>
          )}
        </div>
      </Page>
    </TeamContext.Provider>
  );
}

function TeamTitle({ team, isOwner }: { team: Team; isOwner: boolean }) {
  const { uid } = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/teams/${team.id}`, "PATCH", { name });
      setEditing(false);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-2">
        <div className="flex max-w-md gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className={inputClass}
          />
          <Button type="submit" disabled={!name.trim()}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">
        {team.personal ? "Personal" : team.name}
      </h1>
      {!team.personal && <RoleBadge role={team.roles[uid]} />}
      {isOwner && !team.personal && (
        <Button
          variant="ghost"
          onClick={() => {
            setName(team.name);
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" /> Rename
        </Button>
      )}
    </div>
  );
}

// ── Trees ───────────────────────────────────────────────────────────────────

function TreesCard({ team, canEdit }: { team: Team; canEdit: boolean }) {
  const { uid } = useCurrentUser();
  const router = useRouter();
  const { data: trees, loading } = useTrees(team.id);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const id = await createTree(team.id, uid, title.trim());
      router.push(`/teams/${team.id}/trees/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-[15px] font-semibold">Hypothesis trees</h2>

      {canEdit && (
        <form onSubmit={create} className="space-y-2">
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Main hypothesis for a new tree…"
              maxLength={300}
              className={inputClass}
            />
            <Button type="submit" disabled={busy || !title.trim()} className="shrink-0">
              <Plus className="size-3.5" /> New tree
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </form>
      )}

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
        {loading && <li className="px-3 py-3 text-sm text-slate-400">Loading trees…</li>}
        {!loading && trees.length === 0 && (
          <li className="px-3 py-3 text-sm text-slate-400">
            No trees yet.{canEdit && " Start one above with your main hypothesis."}
          </li>
        )}
        {trees.map((tree) => (
          <TreeRow
            key={tree.id}
            teamId={team.id}
            tree={tree}
            canEdit={canEdit}
            members={team.members}
          />
        ))}
      </ul>
    </Card>
  );
}

function TreeRow({
  teamId,
  tree,
  canEdit,
  members,
}: {
  teamId: string;
  tree: TreeMeta;
  canEdit: boolean;
  members: Team["members"];
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(tree.title);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await renameTree(teamId, tree.id, title.trim());
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${tree.title}" for everyone on the team? This can't be undone.`))
      return;
    try {
      await api(`/api/teams/${teamId}/trees/${tree.id}`, "DELETE");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (editing) {
    return (
      <li className="space-y-1 px-3 py-2">
        <form onSubmit={save} className="flex gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className={inputClass}
          />
          <Button type="submit" disabled={!title.trim()}>
            <Check className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            <X className="size-3.5" />
          </Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </li>
    );
  }
  return (
    <li className="group flex items-center gap-2 px-3 py-2.5">
      <GitBranch className="size-4 shrink-0 text-indigo-500" />
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          href={`/teams/${teamId}/trees/${tree.id}`}
          className="block truncate text-sm text-slate-800 hover:text-indigo-700"
        >
          {tree.title}
        </Link>
        {tree.progress && tree.progress.total > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="w-24 shrink-0">
              <ProgressBar done={tree.progress.done} total={tree.progress.total} />
            </span>
            <span className="shrink-0 tabular-nums">
              {tree.progress.done}/{tree.progress.total} sub-hypotheses done
              {tree.progress.inProgress > 0 && ` · ${tree.progress.inProgress} in progress`}
            </span>
            <AvatarStack uids={tree.progress.assigneeIds} max={4} size="size-4" />
          </div>
        )}
      </div>
      <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">
        {members[tree.createdBy]?.name.split(" ")[0] ?? "Someone"} · {timeAgo(tree.updatedAt)}
      </span>
      {canEdit && (
        <span className="flex shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={() => {
              setTitle(tree.title);
              setEditing(true);
            }}
            title="Rename"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={remove}
            title="Delete"
            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      )}
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

// ── Members & invites ───────────────────────────────────────────────────────

function MembersCard({ team, isOwner }: { team: Team; isOwner: boolean }) {
  const { uid } = useCurrentUser();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState("");

  const loadInvites = useCallback(async () => {
    if (!isOwner) return;
    try {
      setInvites(
        (await api<{ invites: Invite[] }>(`/api/teams/${team.id}/invites`, "GET")).invites,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [isOwner, team.id]);

  // Reload the pending list whenever membership changes (e.g. someone accepted).
  const memberKey = team.memberIds.join(",");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInvites();
  }, [loadInvites, memberKey]);

  async function changeRole(memberId: string, role: Role) {
    setError("");
    try {
      await api(`/api/teams/${team.id}/members/${memberId}`, "PATCH", { role });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function removeMember(memberId: string) {
    if (
      !window.confirm(`Remove ${team.members[memberId]?.name ?? "this member"} from ${team.name}?`)
    )
      return;
    setError("");
    try {
      await api(`/api/teams/${team.id}/members/${memberId}`, "DELETE");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function cancelInvite(inviteId: string) {
    setError("");
    try {
      await api(`/api/teams/${team.id}/invites/${inviteId}`, "DELETE");
      await loadInvites();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-[15px] font-semibold">Members</h2>
      <ul className="space-y-3">
        {team.memberIds.map((memberId) => {
          const m = team.members[memberId];
          const role = team.roles[memberId];
          if (!m || !role) return null;
          return (
            <li key={memberId} className="flex items-center gap-3">
              <Avatar name={m.name} photoURL={m.photoURL} size="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {m.name}
                  {memberId === uid && <span className="font-normal text-slate-400"> (you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{m.email}</p>
              </div>
              {isOwner && role !== "owner" ? (
                <>
                  <select
                    value={role}
                    onChange={(e) => changeRole(memberId, e.target.value as Role)}
                    className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700"
                    aria-label={`Role for ${m.name}`}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => removeMember(memberId)}
                    title="Remove from team"
                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              ) : (
                <RoleBadge role={role} />
              )}
            </li>
          );
        })}
      </ul>
      <ErrorText>{error}</ErrorText>

      {isOwner && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <InviteForm teamId={team.id} onInvited={loadInvites} />
          {invites.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Pending invites
              </p>
              <ul className="space-y-2">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {inv.inviteeEmail}
                    </span>
                    <RoleBadge role={inv.role} />
                    <button
                      onClick={() => cancelInvite(inv.id)}
                      title="Cancel invite"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function InviteForm({ teamId, onInvited }: { teamId: string; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "owner">>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSent("");
    try {
      await api(`/api/teams/${teamId}/invites`, "POST", { email, role });
      setSent(`Invite sent. ${email.trim()} will see it under Team invites.`);
      setEmail("");
      onInvited();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={invite} className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Invite someone
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Their Google email"
        className={inputClass}
      />
      <div className="flex gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Exclude<Role, "owner">)}
          className="rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700"
          aria-label="Role"
        >
          <option value="editor">Editor: can edit trees</option>
          <option value="viewer">Viewer: read and chat only</option>
        </select>
        <Button type="submit" disabled={busy || !email.trim()} className="flex-1">
          <UserPlus className="size-3.5" /> Invite
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {sent && <p className="text-sm text-emerald-700">{sent}</p>}
    </form>
  );
}

function LeaveOrDelete({ team, isOwner }: { team: Team; isOwner: boolean }) {
  const { uid } = useCurrentUser();
  const router = useRouter();
  const [error, setError] = useState("");

  async function run() {
    const question = isOwner
      ? `Delete ${team.name} and all of its trees for everyone? This can't be undone.`
      : `Leave ${team.name}? You'll need a new invite to rejoin.`;
    if (!window.confirm(question)) return;
    try {
      await api(
        isOwner ? `/api/teams/${team.id}` : `/api/teams/${team.id}/members/${uid}`,
        "DELETE",
      );
      router.push("/");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="danger" onClick={run} className="w-full">
        {isOwner ? <Trash2 className="size-3.5" /> : <LogOut className="size-3.5" />}
        {isOwner ? "Delete team" : "Leave team"}
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
