"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "./firebase/client";
import { sameProgress, treeProgress } from "./progress";
import type {
  ChatMessage,
  Evidence,
  ExperimentResult,
  TreeNode,
  TreeProgress,
  WorkStage,
} from "./types";
import { descendantIds, findNode } from "./tree";

// ─────────────────────────────────────────────────────────────────────────────
// The "store": a single place holding one tree's data, plus a list of actions
// that change it. Every component reads from here, so the tree, the detail
// panel and the chat always agree with each other.
//
// The tree lives in Firestore (teams/{teamId}/trees/{treeId}) so teammates can
// work on it together. Actions are applied locally right away, then the nodes
// and messages they changed are written in one batch. Live listeners bring in
// everyone else's edits.
// ─────────────────────────────────────────────────────────────────────────────

export interface AppState {
  title: string;
  nodes: TreeNode[];
  selectedId: string | null;
  chats: Record<string, ChatMessage[]>;
  /** True once the tree, its nodes and its chat have arrived from Firestore. */
  hydrated: boolean;
  /** The tree was deleted, or you no longer have access to it. */
  missing: boolean;
}

const initialState: AppState = {
  title: "",
  nodes: [],
  selectedId: null,
  chats: {},
  hydrated: false,
  missing: false,
};

type Action =
  | { type: "remote"; patch: Partial<Pick<AppState, "title" | "nodes" | "chats" | "missing">> }
  | { type: "select"; id: string | null }
  | { type: "addNode"; node: TreeNode; select?: boolean }
  | { type: "updateNode"; id: string; patch: Partial<TreeNode> }
  | { type: "deleteNode"; id: string }
  | { type: "toggleCollapse"; id: string }
  | { type: "setFolded"; id: string; folded: boolean; reason?: string }
  | {
      type: "recordResult";
      id: string;
      result: ExperimentResult;
      suggestions: TreeNode[];
    }
  | { type: "approveSuggestion"; id: string }
  | { type: "dismissSuggestion"; id: string }
  | { type: "addMessage"; nodeId: string; message: ChatMessage }
  | {
      type: "updateMessage";
      nodeId: string;
      messageId: string;
      patch: Partial<ChatMessage>;
    }
  | { type: "addEvidence"; id: string; evidence: Evidence }
  | { type: "removeEvidence"; id: string; index: number }
  | { type: "assign"; id: string; uid: string }
  | { type: "unassign"; id: string; uid: string }
  | { type: "setStage"; id: string; stage: WorkStage };

/** Actions a viewer may take: looking around and chatting with the AI. */
const VIEWER_ACTIONS = new Set<Action["type"]>(["remote", "select", "addMessage"]);

export const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function patchNode(nodes: TreeNode[], id: string, patch: Partial<TreeNode>) {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "remote":
      return { ...state, ...action.patch };

    case "select":
      return { ...state, selectedId: action.id };

    case "addNode": {
      // Make sure the parent is expanded so the new box is visible.
      const nodes = patchNode(state.nodes, action.node.parentId ?? "", {
        collapsed: false,
      });
      return {
        ...state,
        nodes: [...nodes, action.node],
        selectedId: action.select ? action.node.id : state.selectedId,
      };
    }

    case "updateNode":
      return { ...state, nodes: patchNode(state.nodes, action.id, action.patch) };

    case "deleteNode": {
      const gone = new Set([action.id, ...descendantIds(state.nodes, action.id)]);
      return {
        ...state,
        nodes: state.nodes.filter((n) => !gone.has(n.id)),
        selectedId: gone.has(state.selectedId ?? "") ? null : state.selectedId,
      };
    }

    case "toggleCollapse": {
      const node = findNode(state.nodes, action.id);
      if (!node) return state;
      return {
        ...state,
        nodes: patchNode(state.nodes, action.id, { collapsed: !node.collapsed }),
      };
    }

    case "setFolded":
      return {
        ...state,
        nodes: patchNode(state.nodes, action.id, {
          folded: action.folded,
          foldedReason: action.folded ? action.reason : undefined,
        }),
      };

    case "recordResult": {
      const exp = findNode(state.nodes, action.id);
      if (!exp) return state;
      // Replace any old suggestions from a previous result.
      let nodes = state.nodes.filter(
        (n) => !(n.parentId === exp.id && n.kind === "suggestion"),
      );
      nodes = patchNode(nodes, exp.id, {
        result: action.result,
        status: action.result.outcome,
        collapsed: false,
        fieldReported: undefined, // a new result can be reported to the field again
      });
      // The experiment's result also updates its parent idea's status.
      const parent = findNode(nodes, exp.parentId);
      if (parent && parent.kind === "hypothesis") {
        nodes = patchNode(nodes, parent.id, { status: action.result.outcome });
      }
      return { ...state, nodes: [...nodes, ...action.suggestions] };
    }

    case "approveSuggestion": {
      // The scientist picked an AI suggestion (slide 9):
      //  1. it becomes a real sub-hypothesis next to the old idea
      //  2. its proposed experiment is added underneath it
      //  3. the other suggestions are dismissed
      //  4. the old idea is folded away (not deleted) so the history is kept
      const s = findNode(state.nodes, action.id);
      if (!s) return state;
      const experiment = findNode(state.nodes, s.parentId);
      const oldIdea = findNode(state.nodes, experiment?.parentId ?? null);
      const newParentId =
        oldIdea && oldIdea.kind !== "root"
          ? (oldIdea.parentId ?? oldIdea.id)
          : (experiment?.parentId ?? "root");

      const hypothesisId = newId();
      const newNodes: TreeNode[] = [
        {
          ...s,
          id: hypothesisId,
          parentId: newParentId,
          kind: "hypothesis",
          proposedExperiment: undefined,
        },
      ];
      if (s.proposedExperiment) {
        newNodes.push({
          id: newId(),
          parentId: hypothesisId,
          kind: "experiment",
          status: "planned",
          title: s.proposedExperiment.title,
          goal: s.proposedExperiment.goal,
          steps: s.proposedExperiment.steps,
          expectedResult: s.proposedExperiment.expectedResult,
          rationale: `Proposed by the AI to test the idea that replaced "${oldIdea?.title.slice(0, 60) ?? "the previous idea"}…".`,
          confidence: s.confidence,
          evidence: [],
        });
      }

      let nodes = state.nodes.filter(
        (n) => !(n.kind === "suggestion" && n.parentId === s.parentId),
      );
      if (oldIdea && oldIdea.kind === "hypothesis") {
        nodes = patchNode(nodes, oldIdea.id, {
          folded: true,
          foldedReason: `Result went against this idea. Replaced by: "${s.title}"`,
        });
      }
      nodes = patchNode(nodes, newParentId, { collapsed: false });

      // Move the suggestion's chat history over to the new box.
      const chats = { ...state.chats };
      if (chats[s.id]) {
        chats[hypothesisId] = chats[s.id];
        delete chats[s.id];
      }

      return {
        ...state,
        nodes: [...nodes, ...newNodes],
        selectedId: hypothesisId,
        chats,
      };
    }

    case "dismissSuggestion":
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      };

    case "addMessage":
      return {
        ...state,
        chats: {
          ...state.chats,
          [action.nodeId]: [...(state.chats[action.nodeId] ?? []), action.message],
        },
      };

    case "updateMessage":
      return {
        ...state,
        chats: {
          ...state.chats,
          [action.nodeId]: (state.chats[action.nodeId] ?? []).map((m) =>
            m.id === action.messageId ? { ...m, ...action.patch } : m,
          ),
        },
      };

    case "addEvidence": {
      const target = findNode(state.nodes, action.id);
      if (!target) return state;
      return {
        ...state,
        nodes: patchNode(state.nodes, action.id, {
          evidence: [...target.evidence, action.evidence],
        }),
      };
    }

    case "assign":
    case "unassign": {
      const target = findNode(state.nodes, action.id);
      if (!target) return state;
      const current = target.assignees ?? [];
      const has = current.includes(action.uid);
      if (has === (action.type === "assign")) return state;
      return {
        ...state,
        nodes: patchNode(state.nodes, action.id, {
          assignees:
            action.type === "assign"
              ? [...current, action.uid]
              : current.filter((u) => u !== action.uid),
        }),
      };
    }

    case "setStage": {
      const target = findNode(state.nodes, action.id);
      if (!target || (target.stage ?? "not_started") === action.stage) return state;
      return { ...state, nodes: patchNode(state.nodes, action.id, { stage: action.stage }) };
    }

    case "removeEvidence": {
      const target = findNode(state.nodes, action.id);
      if (!target) return state;
      return {
        ...state,
        nodes: patchNode(state.nodes, action.id, {
          evidence: target.evidence.filter((_, idx) => idx !== action.index),
        }),
      };
    }
  }
}

const StoreContext = createContext<{
  state: AppState;
  dispatch: (action: Action) => void;
  canEdit: boolean;
} | null>(null);

type StoredMessage = ChatMessage & { nodeId: string; order: number };

function flattenChats(chats: AppState["chats"]) {
  const out = new Map<string, { message: ChatMessage; nodeId: string }>();
  for (const [nodeId, messages] of Object.entries(chats)) {
    for (const message of messages) out.set(message.id, { message, nodeId });
  }
  return out;
}

export function StoreProvider({
  teamId,
  treeId,
  canEdit,
  children,
}: {
  teamId: string;
  treeId: string;
  canEdit: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState(initialState);
  // The latest state, readable synchronously by dispatch and the listeners.
  const stateRef = useRef(state);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const commit = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Live listeners for the tree's title, its nodes and its chat messages.
  useEffect(() => {
    const treeRef = doc(getDb(), "teams", teamId, "trees", treeId);
    const loaded = { tree: false, nodes: false, messages: false };
    let storedProgress: TreeProgress | undefined;

    // Trees made before progress tracking (or edited by an old client) may have
    // a stale summary for the team page. Editors quietly fix it.
    const healSummary = () => {
      if (!canEditRef.current || !loaded.tree || !loaded.nodes || stateRef.current.missing) return;
      const actual = treeProgress(stateRef.current.nodes);
      if (sameProgress(storedProgress, actual)) return;
      storedProgress = actual;
      updateDoc(treeRef, { progress: actual }).catch(() => {});
    };

    const apply = (which: keyof typeof loaded, patch: Partial<AppState>) => {
      loaded[which] = true;
      const prev = stateRef.current;
      commit({
        ...reducer(prev, { type: "remote", patch }),
        hydrated: loaded.tree && loaded.nodes && loaded.messages,
      });
      healSummary();
    };
    const lostAccess = () => apply("tree", { missing: true });

    const unsubs = [
      onSnapshot(
        treeRef,
        (snap) => {
          storedProgress = snap.get("progress") as TreeProgress | undefined;
          apply("tree", snap.exists() ? { title: snap.get("title") ?? "" } : { missing: true });
        },
        lostAccess,
      ),
      onSnapshot(
        collection(treeRef, "nodes"),
        (snap) => {
          const nodes = snap.docs.map((d) => d.data() as TreeNode);
          nodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
          apply("nodes", { nodes });
        },
        lostAccess,
      ),
      onSnapshot(
        query(collection(treeRef, "messages"), orderBy("order")),
        (snap) => {
          const chats: AppState["chats"] = {};
          for (const d of snap.docs) {
            const { nodeId, order: _order, ...message } = d.data() as StoredMessage;
            void _order;
            (chats[nodeId] ??= []).push(message);
          }
          apply("messages", { chats });
        },
        lostAccess,
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [teamId, treeId, commit]);

  // Apply an action locally, then write whatever it changed to Firestore.
  const dispatch = useCallback(
    (action: Action) => {
      if (!canEditRef.current && !VIEWER_ACTIONS.has(action.type)) return;
      const prev = stateRef.current;
      const next = reducer(prev, action);
      if (next === prev) return;
      commit(next);
      if (action.type === "select" || action.type === "remote") return;

      const db = getDb();
      const treeRef = doc(db, "teams", teamId, "trees", treeId);
      const batch = writeBatch(db);
      const touchTree = () =>
        batch.update(treeRef, { updatedAt: Date.now(), progress: treeProgress(next.nodes) });

      // Assignment and stage change one field, and teammates often click
      // "work on this" at the same moment, so update just that field (merging
      // assignee lists) instead of rewriting the whole node.
      if (action.type === "assign" || action.type === "unassign" || action.type === "setStage") {
        batch.update(
          doc(treeRef, "nodes", action.id),
          action.type === "setStage"
            ? { stage: action.stage }
            : {
                assignees:
                  action.type === "assign" ? arrayUnion(action.uid) : arrayRemove(action.uid),
              },
        );
        touchTree();
        batch.commit().catch((e) => console.error("Couldn't save your change", e));
        return;
      }

      let writes = 0;
      let seq = Date.now();

      // Nodes: the reducer keeps untouched nodes as the same objects, so any
      // new object is a new or changed node.
      const before = new Map(prev.nodes.map((n) => [n.id, n]));
      const after = new Set<string>();
      for (const node of next.nodes) {
        after.add(node.id);
        if (before.get(node.id) === node) continue;
        batch.set(doc(treeRef, "nodes", node.id), node.order == null ? { ...node, order: seq++ } : node);
        writes++;
      }
      for (const id of before.keys()) {
        if (!after.has(id)) {
          batch.delete(doc(treeRef, "nodes", id));
          writes++;
        }
      }

      // Messages: new, edited, or moved to another node (approveSuggestion).
      const oldMessages = flattenChats(prev.chats);
      for (const [id, { message, nodeId }] of flattenChats(next.chats)) {
        const old = oldMessages.get(id);
        if (old && old.message === message && old.nodeId === nodeId) continue;
        const order = old ? undefined : seq++;
        const data = { ...message, nodeId, ...(order != null && { order }) };
        batch.set(doc(treeRef, "messages", id), data, { merge: Boolean(old) });
        writes++;
      }

      if (!writes) return;
      // Viewers may only add chat messages, so they can't touch the tree doc.
      if (canEditRef.current) touchTree();
      batch.commit().catch((e) => console.error("Couldn't save your change", e));
    },
    [teamId, treeId, commit],
  );

  return (
    <StoreContext.Provider value={{ state, dispatch, canEdit }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
