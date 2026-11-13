"use client";

import { useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  CircleHelp,
  FlaskConical,
  MessageSquare,
  MessageSquareOff,
  MousePointerClick,
  Network,
  Plus,
  Upload,
} from "lucide-react";
import { StoreProvider, useStore } from "@/lib/store";
import { findNode } from "@/lib/tree";
import { TreeCanvas } from "./TreeCanvas";
import { DetailPanel } from "./DetailPanel";
import { ChatPanel } from "./ChatPanel";
import { HelpModal, NodeEditorModal, UploadResultModal } from "./Modals";
import { UIContext, type EditorRequest, type UIContextValue } from "./uiContext";

// The whole HypoTree screen: header, toolbar, tree, detail panel and chat.

export function HypoTreeApp() {
  return (
    <StoreProvider>
      <ReactFlowProvider>
        <Workspace />
      </ReactFlowProvider>
    </StoreProvider>
  );
}

function Workspace() {
  const { state, dispatch } = useStore();
  const [chatOpen, setChatOpen] = useState(true);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const selected = findNode(state.nodes, state.selectedId);

  const ui: UIContextValue = useMemo(
    () => ({ chatOpen, setChatOpen, openEditor: setEditor, openUpload: setUploadFor }),
    [chatOpen],
  );

  // Esc closes the side panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editor && !uploadFor && !helpOpen)
        dispatch({ type: "select", id: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, editor, uploadFor, helpOpen]);

  // "Add Sub-Hypothesis" goes under the selected idea, or under the main idea.
  const addParentId =
    selected && (selected.kind === "hypothesis" || selected.kind === "root") && !selected.folded
      ? selected.id
      : "root";

  const counts = state.nodes.reduce(
    (acc, n) => {
      if (n.folded) return acc;
      if (n.kind === "hypothesis") acc.ideas++;
      if (n.kind === "experiment") acc.experiments++;
      if (n.status === "supported") acc.supported++;
      if (n.status === "contradicted") acc.contradicted++;
      if (n.kind === "suggestion") acc.suggestions++;
      return acc;
    },
    { ideas: 0, experiments: 0, supported: 0, contradicted: 0, suggestions: 0 },
  );

  return (
    <UIContext.Provider value={ui}>
      <div className="flex h-dvh flex-col bg-white text-slate-900">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex items-center gap-2 font-semibold tracking-tight text-indigo-800">
              <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-700 text-white">
                <Network className="size-4" />
              </span>
              HypoTree
            </span>
            <span className="h-5 w-px bg-slate-200" />
            <h1 className="truncate text-[15px] font-semibold text-slate-900">{state.title}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span className="hidden sm:inline">Tree View</span>
            <button
              onClick={() => setHelpOpen(true)}
              className="rounded-full p-1 transition hover:bg-slate-100 hover:text-slate-900"
              title="How HypoTree works"
            >
              <CircleHelp className="size-5" />
            </button>
          </div>
        </header>

        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-2.5">
          <button
            onClick={() => setEditor({ mode: "add", parentId: addParentId, kind: "hypothesis" })}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="size-3.5" /> Add Sub-Hypothesis
          </button>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            {chatOpen ? <MessageSquareOff className="size-3.5" /> : <MessageSquare className="size-3.5" />}
            {chatOpen ? "Hide Chat" : "Show Chat"}
          </button>
          {selected?.kind === "experiment" && (
            <button
              onClick={() => setUploadFor(selected.id)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[13px] font-medium text-rose-700 transition hover:bg-rose-100"
            >
              <Upload className="size-3.5" /> Upload Result
            </button>
          )}

          <div className="ml-auto hidden items-center gap-4 text-[12px] text-slate-500 lg:flex">
            <Stat n={counts.ideas} label="ideas" />
            <Stat n={counts.experiments} label="experiments" />
            <Stat n={counts.supported} label="supported" dot="bg-emerald-500" />
            <Stat n={counts.contradicted} label="contradicted" dot="bg-rose-500" />
            {counts.suggestions > 0 && (
              <Stat n={counts.suggestions} label="awaiting approval" dot="bg-sky-500" />
            )}
          </div>
        </div>

        {/* Workspace */}
        <main className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 bg-[#fafbfc]">
            <TreeCanvas />
            <Legend />
            {!selected && (
              <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-1.5 text-[12.5px] text-slate-500 shadow-sm backdrop-blur">
                <MousePointerClick className="size-3.5" />
                Click any box to see its details and talk to its AI assistant
              </div>
            )}
          </div>
          {selected && <DetailPanel key={`d-${selected.id}`} node={selected} />}
          {selected && chatOpen && <ChatPanel key={`c-${selected.id}`} node={selected} />}
        </main>
      </div>

      {editor && <NodeEditorModal request={editor} onClose={() => setEditor(null)} />}
      {uploadFor && <UploadResultModal experimentId={uploadFor} onClose={() => setUploadFor(null)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </UIContext.Provider>
  );
}

function Stat({ n, label, dot }: { n: number; label: string; dot?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {dot && <span className={`size-1.5 rounded-full ${dot}`} />}
      <b className="font-semibold tabular-nums text-slate-800">{n}</b> {label}
    </span>
  );
}

function Legend() {
  return (
    <div className="absolute left-4 top-4 z-10 hidden space-y-1.5 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-3 text-[11.5px] text-slate-600 shadow-sm backdrop-blur md:block">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Legend</p>
      <LegendRow swatch="border-[1.5px] border-indigo-400 bg-white">Idea</LegendRow>
      <LegendRow swatch="border-[1.5px] border-rose-400 bg-white">
        <span className="flex items-center gap-1">
          Experiment <FlaskConical className="size-3 text-rose-400" />
        </span>
      </LegendRow>
      <LegendRow swatch="border-[1.5px] border-dashed border-sky-400 bg-sky-50">AI suggestion</LegendRow>
      <LegendRow swatch="border border-dashed border-slate-300 bg-slate-50">Folded away</LegendRow>
      <div className="flex items-center gap-2 pt-1">
        <span className="flex w-5 flex-col gap-0.5">
          <span className="h-px bg-indigo-300" />
          <span className="h-[3px] bg-indigo-400" />
        </span>
        Thicker = more confident
      </div>
    </div>
  );
}

function LegendRow({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-5 rounded-[3px] ${swatch}`} />
      {children}
    </div>
  );
}
