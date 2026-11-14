"use client";

import { Hand, LogOut, UserPlus, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { STAGES, STAGE_LABEL, experimentProgress, stageOf } from "@/lib/progress";
import type { TreeNode, WorkStage } from "@/lib/types";
import { Avatar } from "./UserMenu";
import { memberProfile, useTeamContext } from "./teamContext";

// Who's working on a sub-hypothesis and how far along it is.

const STAGE_STYLE: Record<WorkStage, string> = {
  not_started: "bg-neutral-100 text-neutral-600",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
};

export function StagePill({ stage, size = "sm" }: { stage: WorkStage; size?: "xs" | "sm" }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full font-semibold ${STAGE_STYLE[stage]} ${
        size === "xs" ? "px-1.5 py-px text-[8.5px]" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

/** Overlapping avatars of the people on a sub-hypothesis. */
export function AvatarStack({
  uids,
  max = 3,
  size = "size-5",
}: {
  uids: string[];
  max?: number;
  size?: string;
}) {
  const { team } = useTeamContext();
  if (!uids.length) return null;
  const names = uids.map((u) => memberProfile(team, u).name).join(", ");
  return (
    <span className="flex items-center -space-x-1.5" title={names}>
      {uids.slice(0, max).map((u) => {
        const m = memberProfile(team, u);
        return (
          <span key={u} className="rounded-full ring-2 ring-white">
            <Avatar name={m.name} photoURL={m.photoURL} size={size} />
          </span>
        );
      })}
      {uids.length > max && (
        <span
          className={`${size} flex items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-600 ring-2 ring-white`}
        >
          +{uids.length - max}
        </span>
      )}
    </span>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <span
        className="block h-full rounded-full bg-emerald-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** Detail-panel section: assignees, "work on this", stage, experiment progress. */
export function AssignmentSection({ node }: { node: TreeNode }) {
  const { state, dispatch, canEdit } = useStore();
  const { team, uid } = useTeamContext();
  const assignees = node.assignees ?? [];
  const mine = assignees.includes(uid);
  const stage = stageOf(node);
  const exp = experimentProgress(state.nodes, node.id);
  const unassignedMembers = team.memberIds.filter(
    (m) => !assignees.includes(m) && team.roles[m] !== "viewer",
  );

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Who&rsquo;s working on this
        </h3>
        {canEdit && (
          <button
            onClick={() => dispatch({ type: mine ? "unassign" : "assign", id: node.id, uid })}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
              mine
                ? "text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                : "bg-neutral-900 text-white hover:bg-neutral-900"
            }`}
          >
            {mine ? <LogOut className="size-3" /> : <Hand className="size-3" />}
            {mine ? "Stop working on this" : "I'll work on this"}
          </button>
        )}
      </div>

      {assignees.length === 0 ? (
        <p className="text-[13px] text-neutral-500">Nobody yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {assignees.map((a) => {
            const m = memberProfile(team, a);
            return (
              <li key={a} className="flex items-center gap-2 text-[13px]">
                <Avatar name={m.name} photoURL={m.photoURL} size="size-6" />
                <span className="min-w-0 flex-1 truncate text-neutral-700">
                  {m.name}
                  {a === uid && <span className="text-neutral-400"> (you)</span>}
                </span>
                {canEdit && a !== uid && (
                  <button
                    onClick={() => dispatch({ type: "unassign", id: node.id, uid: a })}
                    title={`Unassign ${m.name}`}
                    className="rounded p-0.5 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && !team.personal && unassignedMembers.some((m) => m !== uid) && (
        <label className="flex items-center gap-2 text-[13px] text-neutral-500">
          <UserPlus className="size-3.5 shrink-0" />
          <select
            value=""
            onChange={(e) =>
              e.target.value && dispatch({ type: "assign", id: node.id, uid: e.target.value })
            }
            className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-1.5 py-1 text-[13px] text-neutral-700"
            aria-label="Assign a teammate"
          >
            <option value="">Assign a teammate…</option>
            {unassignedMembers
              .filter((m) => m !== uid)
              .map((m) => (
                <option key={m} value={m}>
                  {memberProfile(team, m).name} ({memberProfile(team, m).email})
                </option>
              ))}
          </select>
        </label>
      )}

      <div className="space-y-2 border-t border-neutral-200 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Progress
          </h3>
          {!canEdit && <StagePill stage={stage} />}
        </div>
        {canEdit && (
          <div
            className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-200/70 p-0.5"
            role="radiogroup"
          >
            {STAGES.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={stage === s}
                onClick={() => dispatch({ type: "setStage", id: node.id, stage: s })}
                className={`rounded-md py-1 text-[12px] font-medium transition ${
                  stage === s
                    ? "bg-white text-neutral-900 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {STAGE_LABEL[s]}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-1">
          <div className="flex justify-between text-[12px] text-neutral-500">
            <span>Experiments with results</span>
            <span className="tabular-nums">
              {exp.withResults} / {exp.total}
            </span>
          </div>
          <ProgressBar done={exp.withResults} total={exp.total} />
        </div>
      </div>
    </div>
  );
}
