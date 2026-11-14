"use client";

import { createContext, useContext } from "react";

/** Navigation inside the field map, offered to paper rows and panels rendered there. */
export interface FieldNav {
  openTopic: (id: string) => void;
  openPaper: (id: string) => void;
  openLineage: (kind: "node" | "paper", id: string) => void;
}

export const FieldNavContext = createContext<FieldNav | null>(null);

/** null outside the field map (e.g. in a box's detail panel). */
export const useFieldNav = () => useContext(FieldNavContext);

export interface SavedAlert {
  token: string;
  label: string;
  kind: "idea" | "topic";
  node?: string;
  created: number;
}

const ALERT_KEY = "hypotree-field-alerts";

export function loadAlerts(): SavedAlert[] {
  try {
    return JSON.parse(localStorage.getItem(ALERT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveAlerts(a: SavedAlert[]) {
  try {
    localStorage.setItem(ALERT_KEY, JSON.stringify(a));
  } catch {
    /* storage blocked: alerts last for this page only */
  }
}
