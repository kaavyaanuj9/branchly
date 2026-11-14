"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  FlaskConical,
  GitBranch,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { findNode } from "@/lib/tree";
import type { TreeNode } from "@/lib/types";

interface Candidate {
  kind: "hypothesis" | "experiment";
  title: string;
  lens: string;
  rationale: string;
  confidence: number;
  goal?: string;
  steps?: string[];
  expectedResult?: string;
}

export function DecomposeModal({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const node = findNode(state.nodes, nodeId);
  const parent = findNode(state.nodes, node?.parentId ?? null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!node) return;
    let ignore = false;

    fetch("/api/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node, parent }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to decompose hypothesis.");
        }
        if (!ignore) {
          setCandidates(data.candidates || []);
          setSelectedIndices(new Set((data.candidates || []).map((_: unknown, i: number) => i)));
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [node, parent]);

  if (!node) return null;

  function addSelected() {
    selectedIndices.forEach((idx) => {
      const c = candidates[idx];
      if (!c) return;

      const newNode: TreeNode = {
        id: newId(),
        parentId: node!.id,
        kind: c.kind,
        title: c.title,
        status: c.kind === "experiment" ? "planned" : "untested",
        lens: c.lens,
        rationale: c.rationale,
        confidence: c.confidence,
        goal: c.goal,
        steps: c.steps,
        expectedResult: c.expectedResult,
        evidence: [],
      };

      dispatch({
        type: "addNode",
        node: newNode,
        select: false,
      });
    });

    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Sparkles className="size-4.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">
                Break Down with Claude Sonnet 5.5
              </h2>
              <p className="line-clamp-1 text-xs text-slate-500">
                Target: <span className="font-medium text-slate-700">{node.title}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="mb-2 size-8 animate-spin text-indigo-600" />
              <p className="text-sm font-medium">
                Claude Sonnet 5.5 is formulating testable sub-claims and experiments…
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 size-4.5 shrink-0 text-rose-600" />
                <div className="space-y-1">
                  <p className="font-semibold">Claude API Error</p>
                  <p className="text-[13px] leading-relaxed text-rose-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && candidates.length === 0 && (
            <div className="py-12 text-center text-slate-500">
              <p className="text-sm">No suggestions were generated.</p>
            </div>
          )}

          {!loading &&
            candidates.map((c, i) => {
              const isSelected = selectedIndices.has(i);
              const isExp = c.kind === "experiment";

              return (
                <div
                  key={i}
                  onClick={() => {
                    setSelectedIndices((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    });
                  }}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    isSelected
                      ? isExp
                        ? "border-rose-400 bg-rose-50/40 shadow-sm"
                        : "border-indigo-400 bg-indigo-50/40 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          isExp
                            ? "bg-rose-100 text-rose-700"
                            : "bg-indigo-100 text-indigo-700"
                        }`}
                      >
                        {isExp ? <FlaskConical className="size-3" /> : <GitBranch className="size-3" />}
                        {isExp ? "Experiment" : "Sub-hypothesis"}
                      </span>
                      {c.lens && (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {c.lens}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span>Confidence</span>
                      <span className="font-semibold text-slate-800">
                        {Math.round(c.confidence * 100)}%
                      </span>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="ml-2 size-4 rounded text-indigo-600"
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-sm font-semibold text-slate-900">{c.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{c.rationale}</p>

                  {isExp && c.goal && (
                    <div className="mt-2.5 rounded-lg border border-slate-100 bg-white/70 p-2 text-xs text-slate-700">
                      <span className="font-medium text-slate-800">Goal: </span>
                      {c.goal}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <p className="text-xs text-slate-500">
            {selectedIndices.size} of {candidates.length} branches selected
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={addSelected}
              disabled={selectedIndices.size === 0}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Check className="size-4" /> Add Selected to Tree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
