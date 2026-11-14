"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BookOpen, Check, FlaskConical, Loader2, Sparkles, X } from "lucide-react";
import type { TreeNode } from "@/lib/types";

interface TreeGenerationModalProps {
  hypothesisTitle: string;
  isOpen: boolean;
  onSuccess: (nodes: TreeNode[]) => void;
  onCancel: () => void;
}

const STAGES = [
  {
    label: "Analyzing hypothesis with Claude Sonnet 5.5",
    sub: "Decomposing into preconditions, mechanisms, boundary conditions & alternatives",
    icon: Sparkles,
    percent: 25,
  },
  {
    label: "Searching Semantic Scholar Academic Graph",
    sub: "Retrieving peer-reviewed papers, citations & evidence for every sub-claim",
    icon: BookOpen,
    percent: 65,
  },
  {
    label: "Designing empirical validation experiments",
    sub: "Generating actionable assay goals, protocols & observable readouts",
    icon: FlaskConical,
    percent: 90,
  },
  {
    label: "Finalizing live workspace",
    sub: "Assembling tree graph & saving to Firestore",
    icon: Check,
    percent: 100,
  },
];

export function TreeGenerationModal({
  hypothesisTitle,
  isOpen,
  onSuccess,
  onCancel,
}: TreeGenerationModalProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    // Progress animation timers for smooth UX
    const t1 = setTimeout(() => {
      setCurrentStage(0);
      setProgress(30);
    }, 600);

    const t2 = setTimeout(() => {
      setCurrentStage(1);
      setProgress(55);
    }, 2800);

    const t3 = setTimeout(() => {
      setCurrentStage(2);
      setProgress(80);
    }, 5500);

    let active = true;

    fetch("/api/trees/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: hypothesisTitle }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to generate hypothesis tree.");
        }
        if (!active) return;
        setCurrentStage(3);
        setProgress(100);
        setTimeout(() => {
          onSuccess(data.nodes);
        }, 500);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      active = false;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isOpen, hypothesisTitle, retryCount, onSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/50 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-900/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-900">
                Generating Hypothesis Tree
              </h2>
              <p className="text-xs text-neutral-500">
                Powered by Claude Sonnet 5.5 &amp; Semantic Scholar
              </p>
            </div>
          </div>
          {error && (
            <button
              onClick={onCancel}
              className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="size-4.5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="space-y-6 px-6 py-6">
          {/* Main hypothesis prompt */}
          <div className="rounded-xl border border-neutral-100 bg-neutral-100/50 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-900">
              Main Hypothesis
            </p>
            <p className="mt-1 text-sm font-medium leading-snug text-neutral-900">
              &ldquo;{hypothesisTitle}&rdquo;
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 size-4.5 shrink-0 text-rose-600" />
                <div className="space-y-1">
                  <p className="font-semibold">Generation Failed</p>
                  <p className="text-[13px] leading-relaxed text-rose-700">{error}</p>
                  <p className="pt-2 text-xs text-rose-600">
                    Please ensure your ANTHROPIC_API_KEY is properly set in .env.local and that your server is running.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-neutral-600">
                  <span>{STAGES[currentStage]?.label}</span>
                  <span className="font-semibold tabular-nums text-neutral-900">{progress}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-neutral-900 to-neutral-900 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Stage checklist */}
              <div className="space-y-3 pt-2">
                {STAGES.map((s, idx) => {
                  const Icon = s.icon;
                  const isDone = currentStage > idx || progress === 100;
                  const isCurrent = currentStage === idx && progress < 100;

                  return (
                    <div
                      key={s.label}
                      className={`flex items-start gap-3 rounded-lg p-2.5 transition ${
                        isCurrent
                          ? "bg-neutral-50 ring-1 ring-neutral-300"
                          : isDone
                            ? "opacity-90"
                            : "opacity-40"
                      }`}
                    >
                      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
                        {isDone ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : isCurrent ? (
                          <Loader2 className="size-3.5 animate-spin text-neutral-900" />
                        ) : (
                          <Icon className="size-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-semibold ${
                            isCurrent ? "text-neutral-900" : isDone ? "text-neutral-800" : "text-neutral-500"
                          }`}
                        >
                          {s.label}
                        </p>
                        <p className="text-[11px] leading-tight text-neutral-500">{s.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="flex justify-end gap-2 border-t border-neutral-100 px-6 py-3.5">
            <button
              onClick={onCancel}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setError(null);
                setCurrentStage(0);
                setProgress(15);
                setRetryCount((c) => c + 1);
              }}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-900"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
