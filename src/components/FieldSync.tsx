"use client";

import { useEffect, useRef } from "react";
import { fieldQuery, MIN_PLACEMENT_CONFIDENCE } from "@/lib/fieldQuery";
import { useStore } from "@/lib/store";
import type { TreeNode } from "@/lib/types";

// Keeps the project tree and the field map in step, whichever view is open:
//  - every idea box is placed on the field map (with its parent idea as context) and gets a
//    crowded / related / sparse reading, redone when its title or parent changes;
//  - boxes with a field alert are checked for newly matching papers.

const WATCH_EVERY_MS = 3 * 60_000;

type Placement = { node: string; placement_confidence: number; novelty_level: TreeNode["fieldNovelty"]; directly_relevant: number | null };

export function FieldSync() {
  const { state, dispatch } = useStore();
  const { nodes, hydrated } = state;

  // 1. Place ideas, one request at a time (each update re-runs this with the rest).
  useEffect(() => {
    if (!hydrated) return;
    const queryOf = (n: TreeNode) => fieldQuery(n, nodes.find((p) => p.id === n.parentId));
    const next = nodes.find(
      (n) =>
        (n.kind === "root" || n.kind === "hypothesis") &&
        !n.folded &&
        (n.fieldTopicFor !== queryOf(n) || n.fieldNovelty === undefined),
    );
    if (!next) return;
    let live = true;
    const q = queryOf(next);
    const ctrl = new AbortController();
    fetch(`/api/field/locate?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Placement>) : Promise.reject(new Error(String(r.status)))))
      .then((r) => {
        if (!live) return;
        const home = r.placement_confidence >= MIN_PLACEMENT_CONFIDENCE;
        dispatch({
          type: "updateNode",
          id: next.id,
          patch: {
            fieldTopic: home ? r.node : undefined,
            fieldNoHome: !home,
            fieldTopicFor: q,
            fieldNovelty: r.novelty_level,
            fieldRelevant: r.directly_relevant ?? undefined,
          },
        });
      })
      .catch(() => {
        /* field map unreachable: try again on the next change */
      });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [nodes, hydrated, dispatch]);

  // 2. New papers for boxes with a field alert (stored only when the list changes).
  const lastHits = useRef(new Map<string, string>());
  const watched = nodes
    .filter((n) => n.fieldWatch)
    .map((n) => `${n.id}:${n.fieldWatch}`)
    .join(",");
  useEffect(() => {
    if (!hydrated || !watched) return;
    let live = true;
    const check = () =>
      watched.split(",").forEach((pair) => {
        const [id, token] = pair.split(":");
        fetch(`/api/field/watch?token=${encodeURIComponent(token)}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ hits: { id: string }[] }>) : null))
          .then((r) => {
            if (!live || !r) return;
            const key = r.hits.map((h) => h.id).join("|");
            if (lastHits.current.get(id) === key) return;
            lastHits.current.set(id, key);
            dispatch({ type: "updateNode", id, patch: { fieldHits: r.hits.map((h) => h.id) } });
          })
          .catch(() => {});
      });
    check();
    const t = setInterval(check, WATCH_EVERY_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [watched, hydrated, dispatch]);

  return null;
}

/** Papers a box's alert has found that the team hasn't looked at yet. */
export function unseenHits(n: TreeNode) {
  const seen = new Set(n.fieldSeen ?? []);
  return (n.fieldHits ?? []).filter((id) => !seen.has(id)).length;
}
