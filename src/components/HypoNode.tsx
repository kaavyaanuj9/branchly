"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  BookOpen,
  Check,
  ChevronDown,
  FlaskConical,
  GitBranch,
  Pencil,
  Search,
  Sparkles,
  Archive,
  X,
} from "lucide-react";
import type { TreeNode } from "@/lib/types";
import { useStore } from "@/lib/store";
import { NODE_WIDTH } from "@/lib/tree";
import { StatusBadge } from "./StatusBadge";
import { useUI } from "./uiContext";

// One box in the tree. React Flow draws it at the position we calculated.

export type HypoFlowNode = Node<
  { node: TreeNode; depth: number; childCount: number; hiddenCount: number },
  "hypo"
>;

export function HypoNode({ data, selected }: NodeProps<HypoFlowNode>) {
  const { node, depth, childCount, hiddenCount } = data;
  const { dispatch } = useStore();
  const { openEditor } = useUI();

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const toggle = (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      {childCount > 0 && !node.folded && (
        <button
          onClick={(e) => {
            stop(e);
            dispatch({ type: "toggleCollapse", id: node.id });
          }}
          title={node.collapsed ? "Expand branch" : "Collapse branch"}
          className="nodrag absolute -bottom-3 left-1/2 z-10 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-500 shadow-sm transition hover:border-slate-400 hover:text-slate-800"
        >
          {node.collapsed ? (
            <>+{hiddenCount}</>
          ) : (
            <ChevronDown className="size-3.5 rotate-180" />
          )}
        </button>
      )}
    </>
  );

  // ── Folded-away idea: compact grey card ──────────────────────────────────
  if (node.folded) {
    return (
      <div
        style={{ width: NODE_WIDTH }}
        className={`relative rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-slate-400 transition ${
          selected ? "ring-2 ring-slate-400 ring-offset-2" : "hover:border-slate-400"
        }`}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-wider">
            <Archive className="size-3" /> Folded away
          </span>
          <button
            onClick={(e) => {
              stop(e);
              dispatch({ type: "setFolded", id: node.id, folded: false });
            }}
            className="nodrag rounded px-1.5 py-0.5 text-[9.5px] font-medium text-slate-500 hover:bg-slate-200"
          >
            Unfold
          </button>
        </div>
        <p className="line-clamp-2 text-[10.5px] leading-snug line-through decoration-slate-300">
          {node.title}
        </p>
        <Handle type="target" position={Position.Top} className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      </div>
    );
  }

  // ── Main idea at the top ─────────────────────────────────────────────────
  if (node.kind === "root") {
    return (
      <div
        style={{ width: NODE_WIDTH + 70 }}
        className={`relative rounded-lg border border-slate-300 bg-slate-100 px-3.5 pb-3.5 pt-2.5 shadow-sm transition ${
          selected ? "ring-2 ring-slate-500 ring-offset-2" : "hover:shadow-md"
        }`}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[8.5px] font-semibold uppercase tracking-wider text-slate-500">
            Paper hypothesis · click to open literature
          </span>
          <span className="flex size-5 items-center justify-center rounded-full bg-slate-400 text-white">
            <BookOpen className="size-3" />
          </span>
        </div>
        <p className="text-[11.5px] font-semibold leading-snug text-slate-900">
          {node.title}
        </p>
        {toggle}
      </div>
    );
  }

  // ── AI suggestion waiting for approval (dashed) ──────────────────────────
  if (node.kind === "suggestion") {
    return (
      <div
        style={{ width: NODE_WIDTH }}
        className={`relative rounded-lg border-[1.5px] border-dashed border-sky-400 bg-sky-50/60 px-3 pb-2.5 pt-2.5 transition ${
          selected ? "ring-2 ring-sky-500 ring-offset-2" : "hover:bg-sky-50"
        }`}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-wider text-sky-600">
            <Sparkles className="size-3" /> AI suggestion
          </span>
          {node.lens && (
            <span className="text-[8.5px] font-medium text-sky-500">{node.lens}</span>
          )}
        </div>
        <p className="line-clamp-4 text-[10.5px] leading-snug text-slate-700">
          {node.title}
        </p>
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={(e) => {
              stop(e);
              dispatch({ type: "approveSuggestion", id: node.id });
            }}
            className="nodrag flex flex-1 items-center justify-center gap-1 rounded-md bg-sky-600 py-1 text-[10px] font-semibold text-white hover:bg-sky-700"
          >
            <Check className="size-3" /> Approve
          </button>
          <button
            onClick={(e) => {
              stop(e);
              dispatch({ type: "dismissSuggestion", id: node.id });
            }}
            className="nodrag flex items-center justify-center rounded-md border border-sky-200 bg-white px-2 py-1 text-[10px] font-medium text-sky-700 hover:bg-sky-100"
            title="Dismiss suggestion"
          >
            <X className="size-3" />
          </button>
        </div>
        <Handle type="target" position={Position.Top} className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
      </div>
    );
  }

  // ── Sub-hypothesis or experiment ─────────────────────────────────────────
  const isExp = node.kind === "experiment";
  const theme = isExp
    ? {
        border: "border-rose-400",
        label: "text-rose-600",
        icon: "bg-rose-300",
        pencil: "bg-rose-600 hover:bg-rose-700",
        ring: "ring-rose-500",
      }
    : {
        border: "border-indigo-400",
        label: "text-indigo-600",
        icon: "bg-indigo-400",
        pencil: "bg-indigo-700 hover:bg-indigo-800",
        ring: "ring-indigo-500",
      };
  const Icon = isExp ? FlaskConical : depth <= 1 ? GitBranch : Search;

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={`group relative rounded-lg border-[1.5px] bg-white px-3 pb-2.5 pt-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition ${theme.border} ${
        selected ? `ring-2 ring-offset-2 ${theme.ring}` : "hover:shadow-md"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span
            className={`text-[8.5px] font-bold uppercase tracking-wider ${theme.label}`}
          >
            {isExp ? "Experiment" : "Sub-hypothesis"}
          </span>
          {isExp && node.status === "planned" && <StatusBadge status="planned" />}
        </span>
        <span
          className={`flex size-5 items-center justify-center rounded-full text-white ${theme.icon}`}
        >
          <Icon className="size-3" />
        </span>
      </div>

      <p
        className={`text-[10.5px] leading-snug text-slate-700 ${
          isExp ? "line-clamp-3" : "line-clamp-5"
        }`}
      >
        {node.title}
      </p>

      <div className="mt-1.5 flex min-h-5 items-end justify-between">
        <span>
          {node.status !== "untested" && node.status !== "planned" && (
            <StatusBadge status={node.status} />
          )}
        </span>
        <button
          onClick={(e) => {
            stop(e);
            openEditor({ mode: "edit", id: node.id });
          }}
          title="Edit"
          className={`nodrag flex size-5 items-center justify-center rounded-full text-white transition ${theme.pencil}`}
        >
          <Pencil className="size-2.5" />
        </button>
      </div>
      {toggle}
    </div>
  );
}
