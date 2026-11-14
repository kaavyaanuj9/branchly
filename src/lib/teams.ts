"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import type { ChatMessage, Invite, Team, TreeMeta, TreeNode } from "@/lib/types";

// Live Firestore reads for teams, trees and invites, plus small write helpers.
// Membership changes go through the /api/teams and /api/invitations routes instead.

export const ROLE_LABEL = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

type Live<T> = { data: T; loading: boolean; error: string | null };

/** Subscribes to a query; `key` must change whenever the query does. */
function useLiveQuery<T>(
  key: string,
  makeQuery: () => Query<DocumentData>,
  map: (docs: T[]) => T[],
) {
  const [state, setState] = useState<Live<T[]> & { key: string }>({
    key,
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    return onSnapshot(
      makeQuery(),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
        setState({ key, data: map(docs), loading: false, error: null });
      },
      (err) => setState({ key, data: [], loading: false, error: err.message }),
    );
    // makeQuery and map are rebuilt every render; `key` captures what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Don't show the previous query's results while a new one loads.
  return state.key === key ? state : { data: [], loading: true, error: null };
}

/** Subscribes to one document. Missing or no-longer-readable docs give `null`. */
function useLiveDoc<T>(path: string) {
  const [state, setState] = useState<Live<T | null> & { path: string }>({
    path,
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    return onSnapshot(
      doc(getDb(), path),
      (snap) =>
        setState({
          path,
          data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null,
          loading: false,
          error: null,
        }),
      // Losing access (e.g. removed from the team) arrives as permission-denied.
      () => setState({ path, data: null, loading: false, error: null }),
    );
  }, [path]);

  return state.path === path ? state : { data: null, loading: true, error: null };
}

/** Teams the user belongs to, personal space first. */
export function useMyTeams(uid: string) {
  return useLiveQuery<Team>(
    `teams:${uid}`,
    () => query(collection(getDb(), "teams"), where("memberIds", "array-contains", uid)),
    (teams) =>
      teams.sort((a, b) =>
        a.personal !== b.personal ? (a.personal ? -1 : 1) : a.name.localeCompare(b.name),
      ),
  );
}

export function useTeam(teamId: string) {
  return useLiveDoc<Team>(`teams/${teamId}`);
}

/** A team's trees, most recently edited first. */
export function useTrees(teamId: string) {
  return useLiveQuery<TreeMeta>(
    `trees:${teamId}`,
    () => collection(getDb(), "teams", teamId, "trees"),
    (trees) => trees.sort((a, b) => b.updatedAt - a.updatedAt),
  );
}

export function useTree(teamId: string, treeId: string) {
  return useLiveDoc<TreeMeta>(`teams/${teamId}/trees/${treeId}`);
}

/** Invites waiting for this user to accept or decline. */
export function useMyInvites(uid: string) {
  return useLiveQuery<Invite>(
    `invites:${uid}`,
    () => query(collection(getDb(), "invites"), where("inviteeUid", "==", uid)),
    (invites) => invites.sort((a, b) => b.createdAt - a.createdAt),
  );
}

// The account this tab is acting as. Sent with API calls so the server can spot
// a session cookie that another tab has switched to a different account.
let actingUid: string | null = null;
export function setActingUid(uid: string) {
  actingUid = uid;
}

/** Calls one of our JSON API routes; throws an Error with the server's message. */
export async function api<T = { ok: true }>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(actingUid ? { "X-HypoTree-Uid": actingUid } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function rootNode(title: string): TreeNode {
  return { id: "root", parentId: null, kind: "root", title, status: "untested", evidence: [] };
}

/** Creates a tree (with its nodes and chat history) in one batch. Returns its id. */
export async function createTree(
  teamId: string,
  uid: string,
  title: string,
  nodes: TreeNode[] = [rootNode(title)],
  chats: Record<string, ChatMessage[]> = {},
): Promise<string> {
  const db = getDb();
  const treeRef = doc(collection(db, "teams", teamId, "trees"));
  const now = Date.now();
  const batch = writeBatch(db);
  batch.set(treeRef, { title, createdBy: uid, createdAt: now, updatedAt: now });
  nodes.forEach((node, order) => batch.set(doc(treeRef, "nodes", node.id), { ...node, order }));
  let order = now;
  for (const [nodeId, messages] of Object.entries(chats)) {
    for (const m of messages) {
      batch.set(doc(treeRef, "messages", m.id), { ...m, nodeId, order: order++ });
    }
  }
  await batch.commit();
  return treeRef.id;
}

export function renameTree(teamId: string, treeId: string, title: string) {
  return updateDoc(doc(getDb(), "teams", teamId, "trees", treeId), {
    title,
    updatedAt: Date.now(),
  });
}

const LEGACY_KEY = "hypotree-state-v1";
/** Before teams, Branchly also kept a list of projects in this browser. */
const LEGACY_LIBRARY_KEY = "hypotree-projects-v1";

type LocalTree = { title?: string; nodes?: TreeNode[]; chats?: Record<string, ChatMessage[]> };

/**
 * Before teams, trees lived in this browser's localStorage (the open one, plus a project list).
 * Move them into the user's personal space once, then forget the local copies.
 * Returns the id of the last tree imported, if any.
 */
export async function importLegacyTree(uid: string): Promise<string | null> {
  const read = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const current = read(LEGACY_KEY) as LocalTree | null;
  const library = (read(LEGACY_LIBRARY_KEY) ?? {}) as Record<string, LocalTree>;
  // the open tree is usually also in the list; import each tree once
  const trees: LocalTree[] = Object.values(library);
  if (current?.nodes?.length && !trees.some((t) => t.title === current.title && t.nodes?.length === current.nodes?.length))
    trees.push(current);
  let last: string | null = null;
  for (const t of trees) {
    if (!t.nodes?.length) continue;
    last = await createTree(`personal_${uid}`, uid, `${t.title ?? "My tree"} (from this browser)`, t.nodes, t.chats ?? {});
  }
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem(LEGACY_LIBRARY_KEY);
  return last;
}
