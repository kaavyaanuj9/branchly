"use client";

import {
  Archive,
  ArchiveRestore,
  Check,
  FileText,
  FlaskConical,
  Layers,
  MessageSquare,
  Pencil,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { childrenOf, findNode } from "@/lib/tree";
import type { TreeNode } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { useUI } from "./uiContext";

// The middle column: everything about the selected box. Where it came from,
// why it was linked (DG2), the papers behind it, and what sits below it.

const KIND_LABEL: Record<TreeNode["kind"], string> = {
  root: "Paper hypothesis",
  hypothesis: "Hypothesis",
  experiment: "Experiment",
  suggestion: "AI suggestion",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DetailPanel({ node }: { node: TreeNode }) {
  const { state, dispatch } = useStore();
  const { openEditor, openUpload, chatOpen, setChatOpen } = useUI();

  const parent = findNode(state.nodes, node.parentId);
  const kids = childrenOf(state.nodes, node.id);
  const subHypotheses = kids.filter((k) => k.kind === "hypothesis");
  const experiments = kids.filter((k) => k.kind === "experiment");
  const suggestions = kids.filter((k) => k.kind === "suggestion");
  const select = (id: string) => dispatch({ type: "select", id });
  const isExp = node.kind === "experiment";

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white xl:w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] font-bold uppercase tracking-wider ${
              isExp
                ? "text-rose-600"
                : node.kind === "suggestion"
                  ? "text-sky-600"
                  : node.kind === "root"
                    ? "text-slate-500"
                    : "text-indigo-700"
            }`}
          >
            {KIND_LABEL[node.kind]}
          </span>
          {node.status !== "untested" && <StatusBadge status={node.status} size="md" />}
          {node.folded && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
              Folded
            </span>
          )}
        </div>
        <button
          onClick={() => dispatch({ type: "select", id: null })}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          title="Close (Esc)"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div className="space-y-3">
          <p className="text-[17px] font-medium leading-snug text-slate-900">{node.title}</p>
          {node.kind !== "suggestion" && (
            <div className="flex flex-wrap gap-1.5">
              <SmallButton onClick={() => openEditor({ mode: "edit", id: node.id })}>
                <Pencil className="size-3" /> Edit
              </SmallButton>
              {!isExp && (
                <SmallButton
                  onClick={() => openEditor({ mode: "add", parentId: node.id, kind: "hypothesis" })}
                >
                  <Plus className="size-3" /> Sub-hypothesis
                </SmallButton>
              )}
              {node.kind === "hypothesis" && (
                <SmallButton
                  onClick={() => openEditor({ mode: "add", parentId: node.id, kind: "experiment" })}
                >
                  <FlaskConical className="size-3" /> Experiment
                </SmallButton>
              )}
              {isExp && (
                <SmallButton onClick={() => openUpload(node.id)}>
                  <Upload className="size-3" /> {node.result ? "Update result" : "Upload result"}
                </SmallButton>
              )}
              {node.kind === "hypothesis" && (
                <SmallButton
                  onClick={() =>
                    dispatch({
                      type: "setFolded",
                      id: node.id,
                      folded: !node.folded,
                      reason: "Folded away by you.",
                    })
                  }
                >
                  {node.folded ? (
                    <>
                      <ArchiveRestore className="size-3" /> Unfold
                    </>
                  ) : (
                    <>
                      <Archive className="size-3" /> Fold away
                    </>
                  )}
                </SmallButton>
              )}
            </div>
          )}
        </div>

        {node.folded && node.foldedReason && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-700">Folded away, not deleted. </span>
            {node.foldedReason}
          </div>
        )}

        {/* Suggestion approval */}
        {node.kind === "suggestion" && (
          <div className="space-y-3 rounded-xl border border-dashed border-sky-300 bg-sky-50/60 p-4">
            <p className="text-[13px] leading-relaxed text-slate-700">
              The AI suggested this after an unexpected result. Nothing changes in your tree until
              you approve it.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => dispatch({ type: "approveSuggestion", id: node.id })}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Check className="size-4" /> Approve &amp; test this
              </button>
              <button
                onClick={() => dispatch({ type: "dismissSuggestion", id: node.id })}
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Why this link: the reason behind every connection (DG2) */}
        {node.rationale && parent && (
          <Section title="Why this link">
            <p className="text-[14px] leading-relaxed text-slate-600">{node.rationale}</p>
            {(node.lens || node.confidence !== undefined) && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[12px] text-slate-500">
                {node.lens && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                    {node.lens}
                  </span>
                )}
                {node.confidence !== undefined && (
                  <span className="flex items-center gap-2">
                    AI confidence
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-indigo-500"
                        style={{ width: `${node.confidence * 100}%` }}
                      />
                    </span>
                    <span className="font-semibold tabular-nums text-slate-700">
                      {Math.round(node.confidence * 100)}%
                    </span>
                  </span>
                )}
              </div>
            )}
          </Section>
        )}

        {parent && (
          <Section title={parent.kind === "experiment" ? "Came from experiment" : "Parent hypothesis"}>
            <button
              onClick={() => select(parent.id)}
              className="text-left text-[14px] leading-relaxed text-slate-500 transition hover:text-slate-900"
            >
              {parent.title}
            </button>
          </Section>
        )}

        {/* Experiment plan */}
        {(isExp || node.proposedExperiment) && (
          <ExperimentPlan
            goal={node.goal ?? node.proposedExperiment?.goal}
            steps={node.steps ?? node.proposedExperiment?.steps}
            expected={node.expectedResult ?? node.proposedExperiment?.expectedResult}
            title={node.proposedExperiment ? `Proposed experiment: ${node.proposedExperiment.title}` : undefined}
          />
        )}

        {/* Result */}
        {isExp &&
          (node.result ? (
            <Section title="Result">
              <div
                className={`space-y-3 rounded-xl border p-4 ${
                  node.result.outcome === "supported"
                    ? "border-emerald-200 bg-emerald-50/50"
                    : node.result.outcome === "contradicted"
                      ? "border-rose-200 bg-rose-50/50"
                      : "border-amber-200 bg-amber-50/50"
                }`}
              >
                <p className="text-[14px] leading-relaxed text-slate-800">{node.result.notes}</p>
                {node.result.files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {node.result.files.map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11.5px] text-slate-600"
                      >
                        <FileText className="size-3" /> {f}
                      </span>
                    ))}
                  </div>
                )}
                <div className="border-t border-black/5 pt-3">
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <Sparkles className="size-3" /> AI reading of the result
                  </p>
                  <p className="text-[13.5px] leading-relaxed text-slate-600">
                    {node.result.interpretation}
                  </p>
                </div>
              </div>
            </Section>
          ) : (
            <button
              onClick={() => openUpload(node.id)}
              className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-200 py-6 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50/40 hover:text-rose-700"
            >
              <Upload className="size-5" />
              <span className="text-sm font-medium">Upload results</span>
              <span className="text-xs text-slate-400">Data, graphs or short notes</span>
            </button>
          ))}

        {suggestions.length > 0 && (
          <Section title={`AI suggested next ideas (${suggestions.length})`}>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-dashed border-sky-300 bg-sky-50/40 p-3"
                >
                  <button
                    onClick={() => select(s.id)}
                    className="text-left text-[13.5px] leading-snug text-slate-700 hover:text-slate-950"
                  >
                    {s.title}
                  </button>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => dispatch({ type: "approveSuggestion", id: s.id })}
                      className="flex items-center gap-1 rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                    >
                      <Check className="size-3" /> Approve
                    </button>
                    <button
                      onClick={() => dispatch({ type: "dismissSuggestion", id: s.id })}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
                    >
                      Dismiss
                    </button>
                    {s.lens && <span className="ml-auto text-[11px] text-sky-600">{s.lens}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {node.evidence.length > 0 && (
          <Section title={node.kind === "root" ? "Literature" : "Supporting evidence"}>
            <ul className="space-y-2.5">
              {node.evidence.map((e, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-slate-600">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" />
                  <span>
                    {e.text}{" "}
                    <span className="whitespace-nowrap text-slate-400">({e.citation})</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {subHypotheses.length > 0 && (
          <Section title="Sub-hypotheses">
            <ChildList items={subHypotheses} onSelect={select} tone="indigo" />
          </Section>
        )}
        {experiments.length > 0 && (
          <Section title="Experiments">
            <ChildList items={experiments} onSelect={select} tone="rose" />
          </Section>
        )}
      </div>

      {/* Footer */}
      <div className="space-y-2 border-t border-slate-100 px-5 py-4">
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          <MessageSquare className="size-4" />
          {chatOpen ? "Hide AI discussion" : "Discuss with AI"}
        </button>
        {kids.length > 0 && (
          <button
            onClick={() => dispatch({ type: "toggleCollapse", id: node.id })}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Layers className="size-4" />
            {node.collapsed ? "Expand this branch" : "Collapse this branch"}
          </button>
        )}
      </div>
    </aside>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
    >
      {children}
    </button>
  );
}

function ExperimentPlan({
  goal,
  steps,
  expected,
  title,
}: {
  goal?: string;
  steps?: string[];
  expected?: string;
  title?: string;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-rose-100 bg-rose-50/30 p-4">
      {title && <p className="text-[13px] font-semibold text-rose-700">{title}</p>}
      {goal && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Goal</p>
          <p className="text-[14px] leading-relaxed text-slate-700">{goal}</p>
        </div>
      )}
      {steps && steps.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Steps</p>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-slate-700">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[11px] font-semibold text-rose-700">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}
      {expected && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Expected result
          </p>
          <p className="text-[14px] leading-relaxed text-slate-700">{expected}</p>
        </div>
      )}
    </div>
  );
}

function ChildList({
  items,
  onSelect,
  tone,
}: {
  items: TreeNode[];
  onSelect: (id: string) => void;
  tone: "indigo" | "rose";
}) {
  return (
    <div className="space-y-2">
      {items.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={`block w-full rounded-lg border p-3 text-left text-[13.5px] leading-snug transition ${
            c.folded
              ? "border-dashed border-slate-200 bg-slate-50 text-slate-400 line-through"
              : tone === "indigo"
                ? "border-indigo-100 bg-indigo-50/30 text-slate-700 hover:border-indigo-300"
                : "border-rose-100 bg-rose-50/30 text-slate-700 hover:border-rose-300"
          }`}
        >
          <span className="line-clamp-3">{c.title}</span>
          {c.status !== "untested" && (
            <span className="mt-1.5 block no-underline">
              <StatusBadge status={c.status} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
