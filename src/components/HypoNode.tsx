"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Archive, BellRing, Check, ChevronRight, CircleDot, FlaskConical, Route, Sparkles, X } from "lucide-react";
import type { TreeNode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { NODE_WIDTH, ROOT_WIDTH } from "@/lib/tree";
import { experimentProgress, stageOf } from "@/lib/progress";
import { AvatarStack, StagePill } from "./Assignment";
import { unseenHits } from "./FieldSync";

// One box in the tree, drawn left to right:
//   Paper hypothesis (the main idea) -> Hypothesis -> Prediction -> Experiment -> Suggested
// A "prediction" is a sub-hypothesis below another hypothesis: the thing an experiment tests.

export type HypoFlowNode = Node<
  { node: TreeNode; depth: number; childCount: number; hiddenCount: number },
  "hypo"
>;

const OUTCOME = {
  supported: { label: "Supported", run: "Run", icon: Check, text: "text-emerald-700", card: "border-emerald-300 bg-emerald-50/70" },
  contradicted: { label: "Contradicted", run: "Run", icon: X, text: "text-rose-700", card: "border-rose-300 bg-rose-50/70" },
  inconclusive: { label: "Unclear", run: "Run", icon: CircleDot, text: "text-amber-700", card: "border-amber-300 bg-amber-50/60" },
} as const;

const NOVELTY = { crowded: "crowded field", related: "related work", sparse: "open ground" } as const;

const handles = (
  <>
    <Handle type="target" position={Position.Left} className="!opacity-0" />
    <Handle type="source" position={Position.Right} className="!opacity-0" />
  </>
);

export function HypoNode({ data, selected }: NodeProps<HypoFlowNode>) {
  const { node, depth, childCount, hiddenCount } = data;
  const { state, dispatch, canEdit } = useStore();
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const toggle =
    childCount > 0 && !node.folded && canEdit ? (
      <button
        onClick={(e) => {
          stop(e);
          dispatch({ type: "toggleCollapse", id: node.id });
        }}
        title={node.collapsed ? "Expand branch" : "Collapse branch"}
        className="nodrag absolute -right-3 top-1/2 z-10 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-300 bg-white px-1 text-[10px] font-semibold text-neutral-500 opacity-0 shadow-sm transition group-hover:opacity-100 hover:text-neutral-900 data-[on=true]:opacity-100"
        data-on={node.collapsed}
      >
        {node.collapsed ? `+${hiddenCount}` : <ChevronRight className="size-3 rotate-180" />}
      </button>
    ) : null;

  // ── folded away: a quiet dashed card ──
  if (node.folded)
    return (
      <div
        style={{ width: NODE_WIDTH }}
        className={`group relative rounded-[10px] border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2.5 text-neutral-400 ${
          selected ? "ring-2 ring-neutral-400" : ""
        }`}
      >
        {handles}
        <p className="mb-1 flex items-center justify-between text-[11px] font-medium">
          <span className="flex items-center gap-1.5">
            <Archive className="size-3.5" /> Folded away
          </span>
          {canEdit && (
            <button
              onClick={(e) => {
                stop(e);
                dispatch({ type: "setFolded", id: node.id, folded: false });
              }}
              className="nodrag rounded px-1 text-[10.5px] text-neutral-500 hover:bg-neutral-200"
            >
              Unfold
            </button>
          )}
        </p>
        <p className="line-clamp-2 text-[12px] leading-snug line-through decoration-neutral-300">{node.title}</p>
      </div>
    );

  // ── the main idea ──
  if (node.kind === "root")
    return (
      <div
        style={{ width: ROOT_WIDTH }}
        className={`group relative rounded-xl border bg-neutral-200/80 px-4 py-4 transition ${
          selected ? "border-neutral-900 shadow-[0_0_0_1px_#171717]" : "border-neutral-300 hover:border-neutral-400"
        }`}
      >
        {handles}
        <p className="mb-2 text-[11px] font-medium text-neutral-500">Paper hypothesis</p>
        <p className="line-clamp-7 text-[14px] font-semibold leading-[1.45] text-neutral-900">{node.title}</p>
        <FieldLine node={node} className="mt-2" />
        {toggle}
      </div>
    );

  // ── AI suggestion waiting for approval ──
  if (node.kind === "suggestion")
    return (
      <div
        style={{ width: NODE_WIDTH - 16 }}
        className={`group relative rounded-[10px] border border-dashed border-neutral-400 bg-white/70 px-3 py-2.5 transition ${
          selected ? "border-solid border-neutral-900 shadow-[0_0_0_1px_#171717]" : "hover:border-neutral-600"
        }`}
      >
        {handles}
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-neutral-600">
          <Sparkles className="size-3.5" /> Suggested
        </p>
        <p className="line-clamp-2 text-[12px] leading-snug text-neutral-800">{node.title}</p>
        <div className={`mt-2 flex items-center gap-1.5 ${canEdit ? "" : "hidden"}`}>
          <button
            onClick={(e) => {
              stop(e);
              dispatch({ type: "approveSuggestion", id: node.id });
            }}
            className="nodrag rounded-md bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-neutral-700"
          >
            Approve
          </button>
          <button
            onClick={(e) => {
              stop(e);
              dispatch({ type: "dismissSuggestion", id: node.id });
            }}
            title="Dismiss"
            className="nodrag flex size-[26px] items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-500 hover:text-neutral-900"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
    );

  // ── hypothesis / prediction / experiment ──
  const isExp = node.kind === "experiment";
  const isPrediction = !isExp && depth >= 2;
  const outcome = node.status === "supported" || node.status === "contradicted" || node.status === "inconclusive" ? OUTCOME[node.status] : null;
  const Icon = isExp ? FlaskConical : isPrediction ? CircleDot : Route;
  const label = isExp ? "Experiment" : isPrediction ? "Prediction" : "Hypothesis";
  const expProgress = experimentProgress(state.nodes, node.id);
  const tint = outcome && (isPrediction || isExp || node.result) ? outcome.card : "border-neutral-300 bg-white";

  return (
    <div
      style={{ width: isExp ? NODE_WIDTH - 16 : NODE_WIDTH }}
      className={`group relative rounded-[10px] border px-3 py-2.5 transition ${tint} ${
        selected ? "!border-neutral-900 shadow-[0_0_0_1px_#171717]" : "hover:border-neutral-500"
      } ${isExp && !outcome ? "bg-neutral-50" : ""}`}
    >
      {handles}
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-neutral-600">
          <Icon className="size-3.5" /> {label}
        </span>
        {isExp ? (
          outcome ? (
            <span className={`flex items-center gap-0.5 font-semibold ${outcome.text}`}>
              <outcome.icon className="size-3" strokeWidth={2.5} /> {outcome.run}
            </span>
          ) : (
            <span className="font-medium text-neutral-500">Planned</span>
          )
        ) : (
          outcome && (
            <span className={`flex items-center gap-0.5 font-semibold ${outcome.text}`}>
              <outcome.icon className="size-3" strokeWidth={2.5} /> {outcome.label}
            </span>
          )
        )}
      </div>
      <p className={`${isExp ? "line-clamp-2" : "line-clamp-3"} text-[12.5px] leading-snug text-neutral-800`}>{node.title}</p>
      {!isExp && (stageOf(node) !== "not_started" || (node.assignees?.length ?? 0) > 0) && (
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <StagePill stage={stageOf(node)} size="xs" />
          <AvatarStack uids={node.assignees ?? []} size="size-5" />
        </div>
      )}
      {!isExp && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1 text-[11px] text-neutral-500">
          {node.confidence !== undefined && <b className="font-semibold text-neutral-800">{Math.round(node.confidence * 100)}%</b>}
          {node.confidence !== undefined && <span>·</span>}
          <span>
            {node.evidence.length} paper{node.evidence.length === 1 ? "" : "s"}
          </span>
          <FieldLine node={node} inline />
        </p>
      )}
      {!isExp && expProgress.total > 0 && (
        <span
          className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-[10px] bg-neutral-100"
          title={`${expProgress.withResults} of ${expProgress.total} experiments have results`}
        >
          <span className="block h-full bg-neutral-800" style={{ width: `${(expProgress.withResults / expProgress.total) * 100}%` }} />
        </span>
      )}
      {toggle}
    </div>
  );
}

/** What the field says: how crowded, and new papers from this box's alert. */
function FieldLine({ node, inline, className = "" }: { node: TreeNode; inline?: boolean; className?: string }) {
  const fresh = unseenHits(node);
  if (!node.fieldNovelty && !fresh) return null;
  const body = (
    <>
      {node.fieldNovelty && (
        <span
          title={`Field map: ${node.fieldRelevant ?? "?"} of the 20 closest papers directly address this`}
          className="text-neutral-400"
        >
          {inline && "· "}
          {NOVELTY[node.fieldNovelty]}
        </span>
      )}
      {fresh > 0 && (
        <span
          title="New papers matched this box's field alert"
          className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-neutral-900 px-1.5 text-[10px] font-semibold text-white"
        >
          <BellRing className="size-2.5" /> {fresh} new
        </span>
      )}
    </>
  );
  return inline ? body : <p className={`text-[11px] ${className}`}>{body}</p>;
}
