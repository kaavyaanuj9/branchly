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
}

export const UIContext = createContext<UIContextValue | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used inside <UIContext.Provider>");
  return ctx;
}
