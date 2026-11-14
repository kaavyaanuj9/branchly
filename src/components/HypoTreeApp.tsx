"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import { doc, writeBatch } from "firebase/firestore";
import { BookOpen, ChevronRight, CircleHelp, Eye, Lightbulb, ListChecks, Loader2, Plus, Sparkles } from "lucide-react";
import { StoreProvider, useStore } from "@/lib/store";
import { useCurrentUser } from "@/lib/firebase/FirebaseProvider";
import { getDb } from "@/lib/firebase/client";
import { findNode } from "@/lib/tree";
import type { Team, TreeNode } from "@/lib/types";
import { Wordmark } from "./BranchField";
import { DecomposeModal } from "./DecomposeModal";
import { DetailPanel } from "./DetailPanel";
import { FieldMapView } from "./FieldMapView";
import { FieldSync } from "./FieldSync";
import { HelpModal, NodeEditorModal, UploadResultModal } from "./Modals";
import { PaperSearchModal } from "./PaperSearchModal";
import { ProgressPanel } from "./ProgressPanel";
import { TeamContext } from "./teamContext";
import { TreeCanvas } from "./TreeCanvas";
import { TreeGenerationModal } from "./teams/TreeGenerationModal";
import { UIContext, type EditorRequest, type UIContextValue } from "./uiContext";
import { InvitesBell, UserMenu } from "./UserMenu";

// One team's hypothesis tree, live from Firestore: header, tree (or the field map around it),
// the side panel with each box's own AI, and the team's progress. Viewers get a read-only view.

export function HypoTreeApp({ team, treeId }: { team: Team; treeId: string }) {
  const { uid } = useCurrentUser();
  const role = team.roles[uid];
  return (
    <StoreProvider key={`${team.id}/${treeId}`} teamId={team.id} treeId={treeId} canEdit={role === "owner" || role === "editor"}>
      <ReactFlowProvider>
        <TeamContext.Provider value={{ team, uid }}>
          <Workspace team={team} treeId={treeId} />
        </TeamContext.Provider>
      </ReactFlowProvider>
    </StoreProvider>
  );
}

function Workspace({ team, treeId }: { team: Team; treeId: string }) {
  const { state, dispatch, canEdit } = useStore();
  const [chatOpen, setChatOpen] = useState(true);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [paperSearchFor, setPaperSearchFor] = useState<string | null>(null);
  const [decomposeFor, setDecomposeFor] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [view, setView] = useState<"project" | "field">("project");
  const [fieldFocus, setFieldFocus] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // The progress panel stays open until you select a different box.
  const [progressAnchor, setProgressAnchor] = useState<string | null | undefined>(undefined);
  const progressOpen = progressAnchor !== undefined && progressAnchor === state.selectedId;
  const setProgressOpen = (open: boolean) => setProgressAnchor(open ? state.selectedId : undefined);

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

  // A tree that is only its main idea can be grown in one go (sub-hypotheses, experiments, papers).
  // The callback must stay the same while generation runs (the modal restarts if it changes),
  // so it reads the latest nodes from a ref.
  const nodesRef = useRef(state.nodes);
  useEffect(() => {
    nodesRef.current = state.nodes;
  }, [state.nodes]);
  const saveGenerated = useCallback(
    async (nodes: TreeNode[]) => {
      try {
        const db = getDb();
        const treeRef = doc(db, "teams", team.id, "trees", treeId);
        const batch = writeBatch(db);
        // keep the existing main box (its field placement, chat), add everything below it
        const root = nodesRef.current.find((n) => n.id === "root");
        nodes.forEach((node, order) => {
          const merged =
            node.id === "root" && root ? { ...root, evidence: [...root.evidence, ...node.evidence].slice(0, 6) } : node;
          batch.set(doc(treeRef, "nodes", node.id), { ...merged, order });
        });
        batch.update(treeRef, { updatedAt: Date.now() });
        await batch.commit();
      } catch (err) {
        console.error("Failed to save the generated tree:", err);
      } finally {
        setGenerating(false);
      }
    },
    [team.id, treeId],
  );

  // Esc closes the side panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editor && !uploadFor && !helpOpen && !paperSearchFor && !decomposeFor)
        dispatch({ type: "select", id: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, editor, uploadFor, helpOpen, paperSearchFor, decomposeFor]);

  // "Add sub-hypothesis" goes under the selected idea, or under the main idea.
  const addParentId =
    selected && (selected.kind === "hypothesis" || selected.kind === "root") && !selected.folded ? selected.id : "root";
  const toReview = state.nodes.filter((n) => n.kind === "suggestion" && !n.folded).length;
  const teamLabel = team.personal ? "Personal" : team.name;

  if (state.missing)
    return (
      <div className="flex h-dvh flex-col">
        <Header team={team} title="" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-neutral-500">
          This tree was deleted, or you no longer have access to it.
          <Link href={`/teams/${team.id}`} className="font-medium text-neutral-900 hover:underline">
            Back to {teamLabel}
          </Link>
        </div>
      </div>
    );
  if (!state.hydrated)
    return (
      <div className="flex h-dvh items-center justify-center text-neutral-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );

  const button = "flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-[7px] text-[13px] font-medium text-neutral-800 transition hover:border-neutral-900";
  return (
    <UIContext.Provider value={ui}>
      {canEdit && <FieldSync />}
      <div className="flex h-dvh flex-col bg-white text-neutral-900">
        <Header team={team} title={state.title}>
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
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!canEdit && (
              <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-600">
                <Eye className="size-3.5" /> View only
              </span>
            )}
            {view === "project" && toReview > 0 && (
              <button
                onClick={() => dispatch({ type: "select", id: state.nodes.find((n) => n.kind === "suggestion")?.id ?? null })}
                title="AI suggestions waiting for your approval"
                className={button}
              >
                <span className="size-1.5 rounded-full bg-neutral-900" /> {toReview} to review
              </button>
            )}
            {view === "project" && (
              <button onClick={() => setProgressOpen(!progressOpen)} className={`${button} ${progressOpen ? "!border-neutral-900" : ""}`}>
                <ListChecks className="size-3.5" /> Progress
              </button>
            )}
            {view === "project" && canEdit && (
              <button onClick={() => setPaperSearchFor(selected?.id || "root")} className={button}>
                <BookOpen className="size-3.5" /> Search literature
              </button>
            )}
            {view === "project" && canEdit && (
              <button
                onClick={() => setEditor({ mode: "add", parentId: addParentId, kind: "hypothesis" })}
                className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-[7px] text-[13px] font-semibold text-white transition hover:bg-neutral-700"
              >
                <Plus className="size-3.5" /> Add sub-hypothesis
              </button>
            )}
            <Link href={`/new?team=${encodeURIComponent(team.id)}`} title="Start a new tree from an idea" className={button}>
              <Lightbulb className="size-3.5" /> New idea
            </Link>
            <button
              onClick={() => setHelpOpen(true)}
              className="rounded-full p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              title="How Branchly works"
            >
              <CircleHelp className="size-[18px]" />
            </button>
          </div>
        </Header>

        {view === "field" ? (
          <main className="flex min-h-0 flex-1">
            <FieldMapView />
          </main>
        ) : (
          <main className="flex min-h-0 flex-1">
            <div className="relative min-w-0 flex-1 bg-[#f6f6f4]">
              <TreeCanvas />
              {!selected && state.nodes.length <= 1 && canEdit && (
                <div className="absolute left-1/2 top-5 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-neutral-300 bg-white/95 py-1.5 pl-4 pr-1.5 text-[13px] text-neutral-700 shadow-sm backdrop-blur">
                  This tree is just its main idea.
                  <button
                    onClick={() => setGenerating(true)}
                    className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1 font-semibold text-white hover:bg-neutral-700"
                  >
                    <Sparkles className="size-3.5" /> Grow the full tree
                  </button>
                </div>
              )}
            </div>
            {progressOpen ? (
              <ProgressPanel onClose={() => setProgressOpen(false)} />
            ) : (
              selected && <DetailPanel key={`d-${selected.id}`} node={selected} />
            )}
          </main>
        )}
      </div>

      {editor && <NodeEditorModal request={editor} onClose={() => setEditor(null)} />}
      {uploadFor && <UploadResultModal experimentId={uploadFor} onClose={() => setUploadFor(null)} />}
      {paperSearchFor && <PaperSearchModal nodeId={paperSearchFor} onClose={() => setPaperSearchFor(null)} />}
      {decomposeFor && <DecomposeModal nodeId={decomposeFor} onClose={() => setDecomposeFor(null)} />}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
      {generating && (
        <TreeGenerationModal
          hypothesisTitle={state.nodes.find((n) => n.id === "root")?.title || state.title}
          isOpen
          onSuccess={saveGenerated}
          onCancel={() => setGenerating(false)}
        />
      )}
    </UIContext.Provider>
  );
}

/** branchly | team › tree, then whatever the page adds, then invites and the account menu. */
function Header({ team, title, children }: { team: Team; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-6">
      <Link href="/" title="All teams and trees">
        <Wordmark className="text-[23px]" />
      </Link>
      <span className="h-6 w-px bg-neutral-200" />
      <nav className="flex min-w-0 max-w-[min(460px,34vw)] items-center gap-1.5 text-[14.5px]">
        <Link href={`/teams/${team.id}`} className="shrink-0 text-neutral-500 hover:text-neutral-900">
          {team.personal ? "Personal" : team.name}
        </Link>
        {title && (
          <>
            <ChevronRight className="size-3.5 shrink-0 text-neutral-300" />
            <h1 className="min-w-0 truncate text-neutral-700" title={title}>
              {title}
            </h1>
          </>
        )}
      </nav>
      {children}
      <div className={`flex shrink-0 items-center gap-2 ${children ? "" : "ml-auto"}`}>
        <InvitesBell />
        <UserMenu />
      </div>
    </header>
  );
}
