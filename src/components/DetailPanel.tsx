"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Check,
  CircleDot,
  Ellipsis,
  ExternalLink,
  FileText,
  FlaskConical,
  Layers,
  Pencil,
  Plus,
  Route,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { childrenOf, findNode } from "@/lib/tree";
import type { TreeNode } from "@/lib/types";
import { ChatDock } from "./ChatPanel";
import { FieldPanel, ReportToField } from "./FieldPanel";
import { useUI } from "./uiContext";

// The side panel for the selected box: what it claims, how sure we are, why it is linked to
// its parent (DG2), the papers behind it, the next experiment, and below it all the box's
// own AI agent to talk to.

const OUTCOME_CHIP = {
  supported: { label: "Supported", cls: "text-emerald-700", icon: Check },
  contradicted: { label: "Contradicted", cls: "text-rose-700", icon: X },
  inconclusive: { label: "Unclear", cls: "text-amber-700", icon: CircleDot },
} as const;

function kindOf(node: TreeNode, parent?: TreeNode) {
  if (node.kind === "root") return { label: "Paper hypothesis", icon: null };
  if (node.kind === "suggestion") return { label: "Suggested", icon: Sparkles };
  if (node.kind === "experiment") return { label: "Experiment", icon: FlaskConical };
  return parent?.kind === "hypothesis" ? { label: "Prediction", icon: CircleDot } : { label: "Hypothesis", icon: Route };
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center justify-between text-[13px] font-medium text-neutral-500">
        {title}
        {aside}
      </h3>
      {children}
    </section>
  );
}

export function DetailPanel({ node }: { node: TreeNode }) {
  const { state, dispatch } = useStore();
  const { openEditor, openUpload, openPaperSearch, openDecompose } = useUI();
  const [menu, setMenu] = useState(false);

  const parent = findNode(state.nodes, node.parentId);
  const kids = childrenOf(state.nodes, node.id);
  const subHypotheses = kids.filter((k) => k.kind === "hypothesis");
  const experiments = kids.filter((k) => k.kind === "experiment");
  const suggestions = kids.filter((k) => k.kind === "suggestion");
  const nextExperiment = experiments.find((e) => e.status === "planned") ?? experiments[0];
  const select = (id: string) => dispatch({ type: "select", id });
  const isExp = node.kind === "experiment";
  const kind = kindOf(node, parent);
  const outcome =
    node.status === "supported" || node.status === "contradicted" || node.status === "inconclusive" ? OUTCOME_CHIP[node.status] : null;

  const menuItems: { label: string; icon: React.ReactNode; run: () => void; show: boolean }[] = [
    { label: "Edit", icon: <Pencil className="size-3.5" />, run: () => openEditor({ mode: "edit", id: node.id }), show: node.kind !== "suggestion" },
    {
      label: "Add sub-hypothesis",
      icon: <Plus className="size-3.5" />,
      run: () => openEditor({ mode: "add", parentId: node.id, kind: "hypothesis" }),
      show: !isExp && node.kind !== "suggestion",
    },
    { label: "Search papers", icon: <BookOpen className="size-3.5" />, run: () => openPaperSearch(node.id), show: node.kind !== "suggestion" },
    {
      label: node.folded ? "Unfold" : "Fold away",
      icon: node.folded ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />,
      run: () => dispatch({ type: "setFolded", id: node.id, folded: !node.folded, reason: "Folded away by you." }),
      show: node.kind === "hypothesis",
    },
    {
      label: node.collapsed ? "Expand this branch" : "Collapse this branch",
      icon: <Layers className="size-3.5" />,
      run: () => dispatch({ type: "toggleCollapse", id: node.id }),
      show: kids.length > 0,
    },
  ];

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-neutral-200 bg-white xl:w-[360px]">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6 pt-5">
        {/* kind, title, actions */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-500">
              {kind.icon && <kind.icon className="size-3.5" />}
              {kind.label}
              {outcome && (
                <span className={`ml-1.5 flex items-center gap-0.5 font-semibold ${outcome.cls}`}>
                  <outcome.icon className="size-3" strokeWidth={2.5} /> {outcome.label}
                </span>
              )}
              {node.folded && <span className="ml-1.5 text-neutral-400">· folded</span>}
            </span>
            <button
              onClick={() => dispatch({ type: "select", id: null })}
              className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              title="Close (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>
          <h2 className="text-[21px] font-semibold leading-[1.25] tracking-[-0.01em] text-neutral-950">{node.title}</h2>
          {node.kind !== "suggestion" && (
            <div className="relative flex flex-wrap items-center gap-2">
              {!isExp && (
                <button
                  onClick={() => openDecompose(node.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-[7px] text-[13px] font-semibold text-white transition hover:bg-neutral-700"
                >
                  <Sparkles className="size-3.5" /> Break down
                </button>
              )}
              {node.kind === "hypothesis" && (
                <OutlineButton onClick={() => openEditor({ mode: "add", parentId: node.id, kind: "experiment" })}>
                  + Experiment
                </OutlineButton>
              )}
              {isExp && (
                <button
                  onClick={() => openUpload(node.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-[7px] text-[13px] font-semibold text-white transition hover:bg-neutral-700"
                >
                  <Upload className="size-3.5" /> {node.result ? "Update result" : "Upload result"}
                </button>
              )}
              <OutlineButton onClick={() => setMenu(!menu)} title="More">
                <Ellipsis className="size-4" />
              </OutlineButton>
              {menu && (
                <div className="absolute left-0 top-11 z-20 w-56 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg">
                  {menuItems
                    .filter((m) => m.show)
                    .map((m) => (
                      <button
                        key={m.label}
                        onClick={() => {
                          setMenu(false);
                          m.run();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-neutral-700 hover:bg-neutral-100"
                      >
                        {m.icon} {m.label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* suggestion approval */}
        {node.kind === "suggestion" && (
          <div className="space-y-3 rounded-xl border border-dashed border-neutral-400 p-4">
            <p className="text-[13px] leading-relaxed text-neutral-600">
              The AI suggested this after an unexpected result. Nothing changes in your tree until you approve it.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => dispatch({ type: "approveSuggestion", id: node.id })}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-[13px] font-semibold text-white hover:bg-neutral-700"
              >
                <Check className="size-4" /> Approve &amp; test this
              </button>
              <OutlineButton onClick={() => dispatch({ type: "dismissSuggestion", id: node.id })}>Dismiss</OutlineButton>
            </div>
          </div>
        )}

        {node.folded && node.foldedReason && (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-[13px] leading-relaxed text-neutral-600">
            <b className="font-semibold text-neutral-800">Folded away, not deleted. </b>
            {node.foldedReason}
          </p>
        )}

        {/* confidence */}
        {node.confidence !== undefined && (
          <div className="flex items-center gap-3 text-[13px]">
            <span className="text-neutral-500">Confidence</span>
            <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-neutral-200">
              <span className="block h-full rounded-full bg-neutral-900" style={{ width: `${node.confidence * 100}%` }} />
            </span>
            <b className="font-semibold tabular-nums text-neutral-900">{Math.round(node.confidence * 100)}%</b>
          </div>
        )}

        {/* why this link (DG2) */}
        {node.rationale && (
          <Section title={parent ? "Why this link" : "About this hypothesis"}>
            <p className="text-[14px] leading-relaxed text-neutral-700">{node.rationale}</p>
            {node.lens && <span className="inline-block rounded-md bg-neutral-100 px-2 py-0.5 text-[12px] text-neutral-600">{node.lens}</span>}
          </Section>
        )}

        {/* evidence */}
        <Section
          title={`Evidence · ${node.evidence.length} paper${node.evidence.length === 1 ? "" : "s"}`}
          aside={
            <button onClick={() => openPaperSearch(node.id)} className="text-[12px] font-medium text-neutral-500 hover:text-neutral-900">
              + Find papers
            </button>
          }
        >
          {node.evidence.length === 0 && <p className="text-[13px] text-neutral-400">No papers yet.</p>}
          <div className="space-y-2">
            {node.evidence.map((e, i) => (
              <div key={i} className="group relative rounded-lg bg-neutral-100 px-3.5 py-3 text-[13.5px] leading-relaxed text-neutral-800">
                <p className="pr-5">{e.text}</p>
                <p className="mt-1 text-[12px] text-neutral-500">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-neutral-900 hover:underline">
                      {e.citation} <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    e.citation
                  )}
                </p>
                <button
                  onClick={() => dispatch({ type: "removeEvidence", id: node.id, index: i })}
                  title="Remove this evidence"
                  className="absolute right-2 top-2 rounded p-1 text-neutral-400 opacity-0 transition hover:bg-neutral-200 hover:text-rose-600 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Section>

        {/* the next experiment under this box */}
        {nextExperiment && (
          <Section title="Next experiment">
            <button
              onClick={() => select(nextExperiment.id)}
              className="flex w-full items-start justify-between gap-3 rounded-lg bg-neutral-100 px-3.5 py-3 text-left text-[13.5px] leading-snug text-neutral-800 transition hover:bg-neutral-200/70"
            >
              <span>{nextExperiment.title}</span>
              <span className="shrink-0 text-[12px] font-medium text-neutral-500">
                {nextExperiment.status === "planned" ? "Planned" : OUTCOME_CHIP[nextExperiment.status as keyof typeof OUTCOME_CHIP]?.label ?? ""}
              </span>
            </button>
          </Section>
        )}

        {/* experiment plan and result */}
        {(isExp || node.proposedExperiment) && (
          <ExperimentPlan
            goal={node.goal ?? node.proposedExperiment?.goal}
            steps={node.steps ?? node.proposedExperiment?.steps}
            expected={node.expectedResult ?? node.proposedExperiment?.expectedResult}
            title={node.proposedExperiment ? `Proposed experiment: ${node.proposedExperiment.title}` : undefined}
          />
        )}
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
                <p className="text-[14px] leading-relaxed text-neutral-800">{node.result.notes}</p>
                {node.result.files.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {node.result.files.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-[11.5px] text-neutral-600">
                        <FileText className="size-3" /> {f}
                      </span>
                    ))}
                  </div>
                )}
                <div className="border-t border-black/5 pt-3">
                  <p className="mb-1 flex items-center gap-1 text-[12px] font-medium text-neutral-500">
                    <Sparkles className="size-3" /> AI reading of the result
                  </p>
                  <p className="text-[13.5px] leading-relaxed text-neutral-600">{node.result.interpretation}</p>
                </div>
              </div>
              <ReportToField key={node.result.recordedAt} node={node} parent={parent} />
            </Section>
          ) : (
            <button
              onClick={() => openUpload(node.id)}
              className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-neutral-200 py-6 text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-800"
            >
              <Upload className="size-5" />
              <span className="text-sm font-medium">Upload results</span>
              <span className="text-xs text-neutral-400">Data, graphs or short notes</span>
            </button>
          ))}

        {/* AI suggestions waiting under this box */}
        {suggestions.length > 0 && (
          <Section title={`Suggested next ideas · ${suggestions.length}`}>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={s.id} className="rounded-lg border border-dashed border-neutral-400 p-3">
                  <button onClick={() => select(s.id)} className="text-left text-[13.5px] leading-snug text-neutral-800 hover:text-neutral-950">
                    {s.title}
                  </button>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => dispatch({ type: "approveSuggestion", id: s.id })}
                      className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-neutral-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => dispatch({ type: "dismissSuggestion", id: s.id })}
                      className="rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
                    >
                      Dismiss
                    </button>
                    {s.lens && <span className="ml-auto text-[11px] text-neutral-400">{s.lens}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {node.kind !== "suggestion" && <FieldPanel node={node} parent={parent} />}

        {subHypotheses.length > 0 && (
          <Section title={`${node.kind === "root" ? "Hypotheses" : "Predictions"} · ${subHypotheses.length}`}>
            <ChildList items={subHypotheses} onSelect={select} />
          </Section>
        )}
        {experiments.length > 1 && (
          <Section title={`Experiments · ${experiments.length}`}>
            <ChildList items={experiments} onSelect={select} />
          </Section>
        )}
        {parent && (
          <Section title={parent.kind === "experiment" ? "Came from experiment" : "Builds on"}>
            <button onClick={() => select(parent.id)} className="text-left text-[13.5px] leading-relaxed text-neutral-500 transition hover:text-neutral-900">
              {parent.title}
            </button>
          </Section>
        )}
      </div>

      {node.kind !== "suggestion" && <ChatDock node={node} />}
    </aside>
  );
}

function OutlineButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-[6px] text-[13px] font-medium text-neutral-800 transition hover:border-neutral-900"
    >
      {children}
    </button>
  );
}

function ExperimentPlan({ goal, steps, expected, title }: { goal?: string; steps?: string[]; expected?: string; title?: string }) {
  return (
    <div className="space-y-4 rounded-xl bg-neutral-100 p-4">
      {title && <p className="text-[13px] font-semibold text-neutral-800">{title}</p>}
      {goal && (
        <div>
          <p className="mb-1 text-[12px] font-medium text-neutral-500">Goal</p>
          <p className="text-[14px] leading-relaxed text-neutral-800">{goal}</p>
        </div>
      )}
      {steps && steps.length > 0 && (
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-neutral-500">Steps</p>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug text-neutral-800">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-neutral-700">
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
          <p className="mb-1 text-[12px] font-medium text-neutral-500">Expected result</p>
          <p className="text-[14px] leading-relaxed text-neutral-800">{expected}</p>
        </div>
      )}
    </div>
  );
}

function ChildList({ items, onSelect }: { items: TreeNode[]; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((c) => {
        const o =
          c.status === "supported" || c.status === "contradicted" || c.status === "inconclusive" ? OUTCOME_CHIP[c.status] : null;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] leading-snug transition ${
              c.folded ? "border-dashed border-neutral-200 text-neutral-400 line-through" : "border-neutral-200 text-neutral-800 hover:border-neutral-500"
            }`}
          >
            <span className="line-clamp-3">{c.title}</span>
            {o ? (
              <span className={`shrink-0 text-[11.5px] font-semibold ${o.cls}`}>{o.label}</span>
            ) : c.kind === "experiment" ? (
              <span className="shrink-0 text-[11.5px] text-neutral-400">Planned</span>
            ) : c.confidence !== undefined ? (
              <span className="shrink-0 text-[11.5px] font-semibold text-neutral-500">{Math.round(c.confidence * 100)}%</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
