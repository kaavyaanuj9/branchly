"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import {
  BookOpen,
  ChevronsUpDown,
  CircleHelp,
  LogOut,
  Lightbulb,
  Plus,
} from "lucide-react";
import { getProject, listProjects, StoreProvider, useStore } from "@/lib/store";
import { FieldSync } from "./FieldSync";
import { IdeaStudio } from "./IdeaStudio";
import { Wordmark } from "./BranchField";
import { findNode } from "@/lib/tree";
import { TreeCanvas } from "./TreeCanvas";
import { FieldMapView } from "./FieldMapView";
import { DetailPanel } from "./DetailPanel";
import { HelpModal, NodeEditorModal, UploadResultModal } from "./Modals";
import { PaperSearchModal } from "./PaperSearchModal";
import { DecomposeModal } from "./DecomposeModal";
import { UIContext, type EditorRequest, type UIContextValue } from "./uiContext";

// The whole Branchly screen: header, toolbar, tree, detail panel and chat.

export interface SignedInUser {
  email: string;
  name: string;
  picture?: string;
  lab?: string;
  demo?: boolean;
}

export function HypoTreeApp({ user, startInStudio = false }: { user: SignedInUser; startInStudio?: boolean }) {
  return (
    <StoreProvider>
      <ReactFlowProvider>
        <Workspace user={user} startInStudio={startInStudio} />
      </ReactFlowProvider>
    </StoreProvider>
  );
}

function Workspace({ user, startInStudio }: { user: SignedInUser; startInStudio: boolean }) {
  const { state, dispatch } = useStore();
  // the idea studio: chat an idea -> field map -> a new hypothesis tree
  const [studio, setStudio] = useState(startInStudio);
  const [chatOpen, setChatOpen] = useState(true);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [paperSearchFor, setPaperSearchFor] = useState<string | null>(null);
  const [decomposeFor, setDecomposeFor] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [view, setView] = useState<"project" | "field">("project");
  const [fieldFocus, setFieldFocus] = useState<string | null>(null);

  const selected = findNode(state.nodes, state.selectedId);

  const ui: UIContextValue = useMemo(
    () => ({
      chatOpen,
      setChatOpen,
      openEditor: setEditor,
      openUpload: setUploadFor,
      openPaperSearch: (id) => setPaperSearchFor(id || state.selectedId || "root"),
      openDecompose: (id) => setDecomposeFor(id),
      view,
      setView,
      fieldFocus,
      openFieldMap: (topicId) => {
        setFieldFocus(topicId ?? null);
        setView("field");
      },
    }),
    [chatOpen, state.selectedId, view, fieldFocus],
  );

  // Esc closes the side panels and modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !editor &&
        !uploadFor &&
        !helpOpen &&
        !paperSearchFor &&
        !decomposeFor
      )
        dispatch({ type: "select", id: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, editor, uploadFor, helpOpen, paperSearchFor, decomposeFor]);

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
      <FieldSync />
      <AnimatePresence>
        {studio && (
          <IdeaStudio
            key="studio"
            user={user}
            onDone={() => {
              setStudio(false);
              setView("project");
              window.history.replaceState(null, "", "/");
            }}
            onClose={() => {
              setStudio(false);
              window.history.replaceState(null, "", "/");
            }}
          />
        )}
      </AnimatePresence>
      <div className="flex h-dvh flex-col bg-white text-slate-900">
        {/* Header */}
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Wordmark className="text-[23px]" />
            <span className="h-6 w-px bg-neutral-200" />
            <ProjectSwitcher />
            <div className="ml-2 flex shrink-0 rounded-lg bg-neutral-100 p-0.5 text-[12.5px]">
              {(
                [
                  ["project", "Tree"],
                  ["field", "Field map"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1 font-medium transition ${
                    view === v ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {view === "project" && counts.suggestions > 0 && (
              <button
                onClick={() => dispatch({ type: "select", id: state.nodes.find((n) => n.kind === "suggestion")?.id ?? null })}
                title="AI suggestions waiting for your approval"
                className="flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-[7px] text-[13px] font-medium text-neutral-800 transition hover:border-neutral-900"
              >
                <span className="size-1.5 rounded-full bg-neutral-900" /> {counts.suggestions} to review
              </button>
            )}
            {view === "project" && (
              <button
                onClick={() => setPaperSearchFor(selected?.id || "root")}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-[7px] text-[13px] font-medium text-neutral-800 transition hover:border-neutral-900"
              >
                <BookOpen className="size-3.5" /> Search literature
              </button>
            )}
            {view === "project" && (
              <button
                onClick={() => setEditor({ mode: "add", parentId: addParentId, kind: "hypothesis" })}
                className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-[7px] text-[13px] font-semibold text-white transition hover:bg-neutral-700"
              >
                <Plus className="size-3.5" /> Add sub-hypothesis
              </button>
            )}
            <button
              onClick={() => setStudio(true)}
              title="Start from a new idea"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-[7px] text-[13px] font-medium text-neutral-800 transition hover:border-neutral-900"
            >
              <Lightbulb className="size-3.5" /> New idea
            </button>
            <button
              onClick={() => setHelpOpen(true)}
              className="rounded-full p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              title="How Branchly works"
            >
              <CircleHelp className="size-[18px]" />
            </button>
            <UserChip user={user} />
          </div>
        </header>

        {/* Workspace */}
        {view === "field" ? (
          <main className="flex min-h-0 flex-1">
            <FieldMapView />
          </main>
        ) : (
        <main className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 bg-[#f6f6f4]">
            <TreeCanvas />
          </div>
          {selected && <DetailPanel key={`d-${selected.id}`} node={selected} />}
        </main>
        )}
      </div>

      {editor && <NodeEditorModal request={editor} onClose={() => setEditor(null)} />}
      {uploadFor && <UploadResultModal experimentId={uploadFor} onClose={() => setUploadFor(null)} />}
      {paperSearchFor && (
        <PaperSearchModal nodeId={paperSearchFor} onClose={() => setPaperSearchFor(null)} />
      )}
      {decomposeFor && (
        <DecomposeModal nodeId={decomposeFor} onClose={() => setDecomposeFor(null)} />
      )}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </UIContext.Provider>
  );
}




/** The project title, which opens the list of projects kept in this browser. */
function ProjectSwitcher() {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; title: string; updated: number }[]>([]);
  return (
    <div className="relative min-w-0 max-w-[min(420px,32vw)]">
      <button
        onClick={() => {
          setProjects(listProjects());
          setOpen(!open);
        }}
        title={`${state.title}\n(click to switch project)`}
        aria-label="Switch project"
        className="flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-1 hover:bg-neutral-100"
      >
        <h1 className="min-w-0 truncate text-[14.5px] text-neutral-600">{state.title}</h1>
        <ChevronsUpDown className="size-3.5 shrink-0 text-neutral-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-[420px] max-w-[90vw] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Projects in this browser
          </p>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                const proj = p.id === state.projectId ? null : getProject(p.id);
                if (proj) dispatch({ type: "openProject", project: proj });
                setOpen(false);
              }}
              className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-[13px] ${
                p.id === state.projectId ? "bg-indigo-50 font-semibold text-indigo-800" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {p.title}
            </button>
          ))}
          <p className="border-t border-slate-100 px-2 pb-1 pt-2 text-[11.5px] text-slate-500">
            Start a new project from an idea on the <b>Field map</b>: search it, then “Start a new hypothesis tree”.
          </p>
        </div>
      )}
    </div>
  );
}

/** Who is signed in, with sign-out. */
function UserChip({ user }: { user: SignedInUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={user.email}
        className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-[13px] font-semibold text-indigo-800 ring-2 ring-white"
      >
        {user.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
        ) : (
          user.name.slice(0, 1).toUpperCase()
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-slate-200 bg-white p-3 text-[13px] shadow-lg">
          <p className="font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-slate-500">{user.email}</p>
          {user.demo && <p className="mt-1 text-[11.5px] text-amber-700">Demo sign-in (email not verified)</p>}
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              router.replace("/login");
              router.refresh();
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
