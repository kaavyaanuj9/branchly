"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import type { ChatMessage, ExperimentResult, TreeNode } from "./types";
import { sampleProject } from "./sampleData";
import { descendantIds, findNode } from "./tree";

// ─────────────────────────────────────────────────────────────────────────────
// The "store": a single place holding all of the app's data, plus a list of
// actions that change it. Every component reads from here, so the tree,
// the detail panel and the chat always agree with each other.
// Changes are saved in your browser (localStorage), so they survive a refresh.
// ─────────────────────────────────────────────────────────────────────────────

export interface AppState {
  title: string;
  nodes: TreeNode[];
  selectedId: string | null;
  chats: Record<string, ChatMessage[]>;
  /** True once saved work (if any) has been loaded from the browser. */
  hydrated: boolean;
}

const initialState: AppState = {
  title: sampleProject.title,
  nodes: sampleProject.nodes,
  selectedId: null,
  chats: {},
  hydrated: false,
};

type Action =
  | { type: "load"; saved: Partial<AppState> | null }
  | { type: "reset" }
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
    };

export const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function patchNode(nodes: TreeNode[], id: string, patch: Partial<TreeNode>) {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "load":
      return { ...initialState, ...action.saved, selectedId: null, hydrated: true };

    case "reset":
      return { ...initialState, hydrated: true };

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
  }
}

const STORAGE_KEY = "hypotree-state-v1";

const StoreContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load saved work from the browser once, when the page opens.
  useEffect(() => {
    let saved: Partial<AppState> | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      /* saved data unreadable: start from the sample project */
    }
    dispatch({ type: "load", saved });
  }, []);

  // Save every change (only after saved work has been loaded).
  useEffect(() => {
    if (!state.hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: keep working without saving */
    }
  }, [state]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
