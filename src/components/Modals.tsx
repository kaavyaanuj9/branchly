"use client";

import { useState } from "react";
import { AlertCircle, FileText, FlaskConical, GitBranch, Loader2, Trash2, Upload, X } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { findNode } from "@/lib/tree";
import type { ExperimentResult, TreeNode } from "@/lib/types";
import { interpretResultWithAI } from "@/lib/mockAgent";
import type { EditorRequest } from "./uiContext";

// Pop-up windows: add/edit a box, upload a result, and the help guide.

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 p-4 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-900/5 ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-neutral-700">
        {label} {hint && <span className="font-normal text-neutral-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

// ── Add / edit a box ─────────────────────────────────────────────────────────
export function NodeEditorModal({
  request,
  onClose,
}: {
  request: EditorRequest;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const existing = request.mode === "edit" ? findNode(state.nodes, request.id) : undefined;
  const parent = findNode(
    state.nodes,
    request.mode === "add" ? request.parentId : (existing?.parentId ?? null),
  );

  const [kind, setKind] = useState<"hypothesis" | "experiment">(
    existing?.kind === "experiment" || (request.mode === "add" && request.kind === "experiment")
      ? "experiment"
      : "hypothesis",
  );
  const [title, setTitle] = useState(existing?.title ?? "");
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [goal, setGoal] = useState(existing?.goal ?? "");
  const [steps, setSteps] = useState((existing?.steps ?? []).join("\n"));
  const [expected, setExpected] = useState(existing?.expectedResult ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isRoot = existing?.kind === "root";
  const canChooseKind = request.mode === "add" && parent?.kind !== "root";
  const isExp = kind === "experiment";

  function save() {
    if (!title.trim()) return;
    const fields: Partial<TreeNode> = {
      title: title.trim(),
      rationale: rationale.trim() || undefined,
      ...(isExp && {
        goal: goal.trim() || undefined,
        steps: steps
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        expectedResult: expected.trim() || undefined,
      }),
    };
    if (request.mode === "edit") {
      dispatch({ type: "updateNode", id: request.id, patch: fields });
    } else {
      dispatch({
        type: "addNode",
        select: true,
        node: {
          id: newId(),
          parentId: request.parentId,
          kind,
          status: isExp ? "planned" : "untested",
          evidence: [],
          title: title.trim(),
          ...fields,
        },
      });
    }
    onClose();
  }

  const heading =
    request.mode === "edit"
      ? `Edit ${isRoot ? "main idea" : isExp ? "experiment" : "hypothesis"}`
      : isExp
        ? "Add experiment"
        : "Add sub-hypothesis";

  return (
    <Modal title={heading} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {parent && (
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-[12.5px] leading-snug text-neutral-500">
            <span className="font-medium text-neutral-600">Under: </span>
            {parent.title}
          </p>
        )}

        {canChooseKind && (
          <div className="grid grid-cols-2 gap-2">
            {(["hypothesis", "experiment"] as const).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  kind === k
                    ? k === "experiment"
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-neutral-500 bg-neutral-100 text-neutral-900"
                    : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {k === "experiment" ? <FlaskConical className="size-4" /> : <GitBranch className="size-4" />}
                {k === "experiment" ? "Experiment" : "Sub-hypothesis"}
              </button>
            ))}
          </div>
        )}

        <Field label={isExp ? "Experiment name" : "Statement"}>
          <textarea
            autoFocus
            rows={isExp ? 2 : 3}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              isExp
                ? "e.g. Pan-caspase inhibition rescue assay"
                : "e.g. Venetoclax sensitivity is preserved in TP53-deficient cells."
            }
            className={inputClass}
          />
        </Field>

        {!isRoot && (
          <Field label="Why is this linked to its parent?" hint="(optional)">
            <textarea
              rows={2}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Write down the reason so it isn't lost later."
              className={inputClass}
            />
          </Field>
        )}

        {isExp && (
          <>
            <Field label="Goal">
              <input value={goal} onChange={(e) => setGoal(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Steps" hint="(one per line)">
              <textarea rows={3} value={steps} onChange={(e) => setSteps(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Expected result">
              <input value={expected} onChange={(e) => setExpected(e.target.value)} className={inputClass} />
            </Field>
          </>
        )}

        <div className="flex items-center gap-2 pt-2">
          {request.mode === "edit" && !isRoot && (
            <button
              type="button"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                dispatch({ type: "deleteNode", id: request.id });
                onClose();
              }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                confirmDelete ? "bg-rose-600 text-white hover:bg-rose-700" : "text-rose-600 hover:bg-rose-50"
              }`}
            >
              <Trash2 className="size-4" />
              {confirmDelete ? "Click again to delete (and everything below)" : "Delete"}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:bg-neutral-300"
            >
              {request.mode === "edit" ? "Save changes" : "Add to tree"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── Upload an experiment result ──────────────────────────────────────────────
const OUTCOMES: { value: ExperimentResult["outcome"]; label: string; desc: string; cls: string }[] = [
  {
    value: "supported",
    label: "As expected",
    desc: "The result matches the expected result",
    cls: "border-emerald-400 bg-emerald-50 text-emerald-800",
  },
  {
    value: "contradicted",
    label: "Unexpected",
    desc: "The result goes against the idea",
    cls: "border-rose-400 bg-rose-50 text-rose-800",
  },
  {
    value: "inconclusive",
    label: "Unclear",
    desc: "Hard to tell either way",
    cls: "border-amber-400 bg-amber-50 text-amber-800",
  },
];

export function UploadResultModal({ experimentId, onClose }: { experimentId: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const exp = findNode(state.nodes, experimentId);
  const [notes, setNotes] = useState(exp?.result?.notes ?? "");
  const [files, setFiles] = useState<string[]>(exp?.result?.files ?? []);
  const [outcome, setOutcome] = useState<ExperimentResult["outcome"] | null>(exp?.result?.outcome ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!exp) return null;
  const hypothesis = findNode(state.nodes, exp.parentId) ?? exp;

  async function submit() {
    if (!exp || !notes.trim() || !outcome) return;
    setLoading(true);
    setError(null);

    try {
      const { interpretation, suggestions } = await interpretResultWithAI(
        exp,
        hypothesis,
        notes.trim(),
        outcome,
      );

      const treeSuggestions: TreeNode[] = suggestions.map((s) => ({
        ...s,
        id: newId(),
        parentId: exp.id,
      }));

      dispatch({
        type: "recordResult",
        id: exp.id,
        suggestions: treeSuggestions,
        result: {
          notes: notes.trim(),
          files,
          outcome,
          interpretation,
          recordedAt: new Date().toISOString().slice(0, 10),
        },
      });
      dispatch({ type: "select", id: exp.id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          <Upload className="size-4 text-rose-600" /> Upload results
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-rose-50/60 px-3 py-2.5 text-[12.5px] leading-snug">
          <p className="font-semibold text-rose-700">{exp.title}</p>
          {exp.expectedResult && <p className="mt-0.5 text-neutral-500">Expected: {exp.expectedResult}</p>}
        </div>

        <Field label="What did you observe?">
          <textarea
            autoFocus
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Both groups survived equally after 3 days."
            className={inputClass}
          />
        </Field>

        <Field label="Attach data, graphs or notes" hint="(optional)">
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-200 py-4 text-sm text-neutral-500 transition hover:border-neutral-300 hover:bg-neutral-50">
              <Upload className="size-4" /> Choose files
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) =>
                  setFiles((f) => [...new Set([...f, ...Array.from(e.target.files ?? []).map((x) => x.name)])])
                }
              />
            </label>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-600"
                  >
                    <FileText className="size-3" /> {f}
                    <button onClick={() => setFiles(files.filter((x) => x !== f))} className="text-neutral-400 hover:text-neutral-700">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11.5px] text-neutral-400">
              Demo mode: only file names are saved. Files stay on your computer.
            </p>
          </div>
        </Field>

        <Field label="How did it compare to the expected result?">
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => setOutcome(o.value)}
                className={`rounded-lg border px-2.5 py-2 text-left transition ${
                  outcome === o.value ? o.cls : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="block text-[11px] leading-tight opacity-75">{o.desc}</span>
              </button>
            ))}
          </div>
        </Field>
        {outcome === "contradicted" && (
          <p className="text-[12.5px] text-neutral-900">
            Claude Sonnet 5.5 will formulate three new counter-hypotheses with follow-up experiments to explain this anomaly.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Interpretation Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!notes.trim() || !outcome || loading}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:bg-neutral-300"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {loading ? "Claude is analyzing…" : "Save & ask Claude to interpret"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Help guide ───────────────────────────────────────────────────────────────
export function HelpModal({ onClose }: { onClose: () => void }) {
  const steps = [
    ["Break down", "Your main idea sits at the top. Smaller, testable ideas branch below it."],
    ["Plan experiments", "Each idea gets experiments with a goal, steps and an expected result. The reason for every link is saved."],
    ["Read results", "Select an experiment and upload a result. The AI explains what it means and marks the idea."],
    ["Choose next step", "If a result is unexpected, the AI suggests new ideas (dashed boxes). You approve one; the old idea is folded away."],
  ];
  return (
    <Modal title="How Branchly works" onClose={onClose} wide>
      <div className="space-y-6">
        <ol className="grid gap-3 sm:grid-cols-2">
          {steps.map(([t, d], i) => (
            <li key={t} className="rounded-xl border border-neutral-200 p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <span className="flex size-5 items-center justify-center rounded-full bg-neutral-900 text-[11px] text-white">
                  {i + 1}
                </span>
                {t}
              </p>
              <p className="text-[13px] leading-relaxed text-neutral-600">{d}</p>
            </li>
          ))}
        </ol>

        <div className="space-y-2 text-[13px] text-neutral-600">
          <p className="font-semibold text-neutral-800">Reading the tree</p>
          <ul className="space-y-1.5">
            <li>• <b className="text-neutral-900">Blue boxes</b> are ideas; <b className="text-rose-600">red boxes</b> are experiments; <b className="text-neutral-900">dashed boxes</b> are AI suggestions waiting for you.</li>
            <li>• Thicker lines mean the AI is more confident about that link.</li>
            <li>• Click any box for details. &ldquo;Discuss with AI&rdquo; opens that box&rsquo;s own assistant.</li>
            <li>• Scroll to zoom, drag the background to move around. Press Esc to close panels.</li>
          </ul>
          <p className="pt-1 text-neutral-500">
            Literature searching is connected to the <b>Semantic Scholar API</b>. Reasoning, hypothesis decomposition, and result interpretation are powered by <b>Claude Sonnet 5.5</b>.
          </p>
        </div>

        <div className="flex items-center justify-end border-t border-neutral-100 pt-4">
          <button onClick={onClose} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
