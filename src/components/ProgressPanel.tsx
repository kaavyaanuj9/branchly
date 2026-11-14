"use client";

import { useState } from "react";
import { X , ListChecks } from "lucide-react";
import { useStore } from "@/lib/store";
import { activeSubHypotheses, experimentProgress, stageOf, treeProgress } from "@/lib/progress";
import { findNode } from "@/lib/tree";
import type { TreeNode } from "@/lib/types";
import { AvatarStack, ProgressBar, StagePill } from "./Assignment";
import { StatusBadge } from "./StatusBadge";
import { useTeamContext } from "./teamContext";

type Filter = "all" | "mine" | "unassigned";

function depthOf(nodes: TreeNode[], node: TreeNode) {
  let depth = 0;
  let parent = findNode(nodes, node.parentId);
  while (parent && parent.kind !== "root") {
    depth++;
    parent = findNode(nodes, parent.parentId);
  }
  return depth;
}

/** Every sub-hypothesis at a glance: who's on it, its stage and its results. */
export function ProgressPanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const { uid } = useTeamContext();
  const [filter, setFilter] = useState<Filter>("all");

  const all = activeSubHypotheses(state.nodes);
  const summary = treeProgress(state.nodes);
  const rows = all.filter((n) =>
    filter === "mine"
      ? n.assignees?.includes(uid)
      : filter === "unassigned"
        ? !n.assignees?.length
        : true,
  );
  const mineCount = all.filter((n) => n.assignees?.includes(uid)).length;

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-neutral-200 bg-white xl:w-[360px]">
      <div className="flex items-center justify-between px-6 pt-5">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-500">
          <ListChecks className="size-3.5" /> Team progress
        </span>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          title="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3 border-b border-neutral-100 px-6 pb-5 pt-3">
        <p className="text-[21px] font-semibold leading-tight tracking-[-0.01em] text-neutral-950">
          <b className="tabular-nums">{summary.done}</b> of{" "}
          <b className="tabular-nums">{summary.total}</b> sub-hypotheses done
        </p>
        <div className="flex h-2 overflow-hidden rounded-full bg-neutral-100">
          {summary.total > 0 && (
            <>
              <span
                className="bg-emerald-500"
                style={{ width: `${(summary.done / summary.total) * 100}%` }}
              />
              <span
                className="bg-amber-400"
                style={{ width: `${(summary.inProgress / summary.total) * 100}%` }}
              />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-neutral-500">
          <Legend dot="bg-emerald-500" n={summary.done} label="done" />
          <Legend dot="bg-amber-400" n={summary.inProgress} label="in progress" />
          <Legend dot="bg-neutral-300" n={summary.notStarted} label="not started" />
          <span>
            <b className="tabular-nums text-neutral-700">{summary.unassigned}</b> unassigned
          </span>
        </div>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5 text-[12px]" role="tablist">
          {(
            [
              ["all", `All (${all.length})`],
              ["mine", `Mine (${mineCount})`],
              ["unassigned", `Unassigned (${summary.unassigned})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`flex-1 rounded-md py-1 font-medium transition ${
                filter === key
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 divide-y divide-neutral-100 overflow-y-auto">
        {rows.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-neutral-400">
            {all.length === 0
              ? "No sub-hypotheses yet."
              : filter === "mine"
                ? "You're not working on any sub-hypotheses yet. Open one and click “I'll work on this”."
                : "Everything has someone on it."}
          </li>
        )}
        {rows.map((n) => {
          const exp = experimentProgress(state.nodes, n.id);
          return (
            <li key={n.id}>
              <button
                onClick={() => {
                  dispatch({ type: "select", id: n.id });
                  onClose();
                }}
                className="block w-full space-y-2 px-5 py-3 text-left transition hover:bg-neutral-50"
                style={{ paddingLeft: 20 + depthOf(state.nodes, n) * 14 }}
              >
                <p className="line-clamp-2 text-[13px] leading-snug text-neutral-800">{n.title}</p>
                <div className="flex items-center gap-2">
                  <StagePill stage={stageOf(n)} />
                  {n.status !== "untested" && n.status !== "planned" && (
                    <StatusBadge status={n.status} />
                  )}
                  <span className="ml-auto">
                    {n.assignees?.length ? (
                      <AvatarStack uids={n.assignees} max={4} />
                    ) : (
                      <span className="text-[11px] text-neutral-400">Unassigned</span>
                    )}
                  </span>
                </div>
                {exp.total > 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                    <ProgressBar done={exp.withResults} total={exp.total} />
                    <span className="shrink-0 tabular-nums">
                      {exp.withResults}/{exp.total} experiments
                    </span>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Legend({ dot, n, label }: { dot: string; n: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${dot}`} />
      <b className="tabular-nums text-neutral-700">{n}</b> {label}
    </span>
  );
}
