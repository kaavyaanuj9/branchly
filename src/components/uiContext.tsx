"use client";

import { createContext, useContext } from "react";

// Shared on-screen state: which pop-up window is open, whether chat is shown.

export type EditorRequest =
  | { mode: "add"; parentId: string; kind?: "hypothesis" | "experiment" }
  | { mode: "edit"; id: string };

export interface UIContextValue {
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  openEditor: (req: EditorRequest) => void;
  openUpload: (experimentId: string) => void;
  openPaperSearch: (nodeId?: string) => void;
  openDecompose: (nodeId: string) => void;
  /** Which canvas is showing: the team's project tree, or the field map around it. */
  view: "project" | "field";
  setView: (view: "project" | "field") => void;
  /** Switch to the field map, focused on a topic (Research Tree node id) if given. */
  openFieldMap: (topicId?: string) => void;
  fieldFocus: string | null;
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used inside <UIContext.Provider>");
  return ctx;
}
