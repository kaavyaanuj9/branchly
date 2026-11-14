// Server-side client for Research Tree: the field-scale literature map that HypoTree uses as
// its literature layer (see research-tree/). Research Tree runs as its own service; the
// cancer & cell biology instance listens on port 8766 by default.

const BASE = (process.env.RESEARCH_TREE_URL || "http://127.0.0.1:8766").replace(/\/$/, "");

export interface FieldPaper {
  id: string;
  title: string;
  authors: string[];
  announced: number;
  url: string;
  abstract?: string;
  sim?: number;
  reason?: string;
  built_on?: number;
  evidence?: Record<string, string>;
  strength?: "strong" | "possible" | "below";
}

export interface LocateResult {
  path: { id: string; label: string }[];
  node: string;
  novelty_level: "crowded" | "related" | "sparse";
  novelty_hint: string;
  directly_relevant: number | null;
  placement_confidence: number;
  nearest: FieldPaper[];
}

export interface ReadingResult {
  order: string[];
  sections: Record<string, FieldPaper[]>;
  classics: FieldPaper[];
}

export interface AspectsResult {
  parts: Record<string, string>;
  verdict: { kind: string; text: string };
  singles: Record<string, { count: number; estimate: number; papers: FieldPaper[] }>;
  combos: { parts: string[]; count: number; strong: number; capped: boolean; papers: FieldPaper[]; closest: FieldPaper[] }[];
}

export class ResearchTreeUnavailable extends Error {}

async function call<T>(path: string, init?: RequestInit, timeoutMs = 60_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch {
    throw new ResearchTreeUnavailable(
      `Research Tree is not reachable at ${BASE}. Start it with: ` +
        "npm run dev:all (or: cd research-tree && RT_FIELD=cell_death python3 server.py)",
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Research Tree error ${res.status}`);
  return body as T;
}

export const fieldUrl = (q?: string) => (q ? `${BASE}/?q=${encodeURIComponent(q)}` : BASE);

export function status() {
  return call<{ field: string; coverage: string; papers: number; last_poll?: number; continuous?: boolean; aspect_examples?: Record<string, string> }>("/api/status");
}

export interface FieldTreeNode {
  id: string;
  label: string;
  depth: number;
  branch?: string;
  keywords?: string[];
  count: number;
  n7: number;
  n14: number;
  momentum: number;
  children?: FieldTreeNode[];
  tips?: FieldPaper[];
}

/** The whole field map: root -> curated branches -> grown topics, with per-node stats. */
export function tree() {
  return call<FieldTreeNode & { status: { field: string; coverage: string } }>("/api/tree");
}

/** One branch or topic: stats, newest papers, nearest topics elsewhere, landmarks. */
export function topic(id: string) {
  return call<Record<string, unknown>>(`/api/node/${encodeURIComponent(id)}?limit=30`);
}

export function locate(text: string) {
  return call<LocateResult>(`/api/locate?${new URLSearchParams({ q: text.slice(0, 4000) })}`);
}

export function readingList(text: string) {
  return call<ReadingResult>(`/api/reading?${new URLSearchParams({ q: text.slice(0, 4000) })}`, undefined, 90_000);
}

export function aspects(parts: { problem?: string; method?: string; setting?: string }) {
  const q = new URLSearchParams(Object.entries(parts).filter(([, v]) => v && v.trim()) as [string, string][]);
  return call<AspectsResult>(`/api/aspects?${q}`, undefined, 180_000);
}

/** An alert for an idea (text) or a topic (node id) on the field map. */
export function createWatch(spec: { query?: string; node?: string; label?: string }) {
  const body = spec.node ? { kind: "topic", node: spec.node, label: spec.label } : { kind: "idea", query: spec.query, label: spec.label };
  return call<{ token: string; feed: string; view: string }>("/api/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, 120_000);
}

export function stopWatch(token: string) {
  return call<{ ok: boolean }>(`/api/watch/${encodeURIComponent(token)}/stop`, { method: "POST" });
}

/** Tell the field what you are doing on a topic: claim / promising / dead_end / note / done. */
export function signal(node: string, body: { kind: string; who?: string; text?: string; visibility?: string; actor?: string }) {
  return call<{ ok: boolean }>(`/api/node/${encodeURIComponent(node)}/signal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Citation lineage around a branch/topic, or around one paper. Edges {s, t}: s cites t. */
export function lineage(kind: "node" | "paper", id: string) {
  return call<Record<string, unknown>>(`/api/lineage/${kind}/${encodeURIComponent(id)}`, undefined, 90_000);
}

export function paper(id: string) {
  return call<Record<string, unknown>>(`/api/paper/${encodeURIComponent(id)}`);
}

/** The live event stream (new papers, signals, rebuilds), passed through as-is. */
export async function events(signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(BASE + "/api/events", { signal, cache: "no-store" });
  } catch {
    throw new ResearchTreeUnavailable(`Research Tree is not reachable at ${BASE}.`);
  }
}

export function viewWatch(token: string) {
  return call<{ label: string; hits: (FieldPaper & { matched: number; reason: string })[] }>(
    `/api/watch/${encodeURIComponent(token)}`,
  );
}

/** Closest papers in the field, formatted for a Claude prompt. Empty if the map is down. */
export async function literatureContext(text: string, k = 5): Promise<string> {
  try {
    const r = await locate(text);
    return r.nearest
      .slice(0, k)
      .map(
        (p, i) =>
          `[${i + 1}] ${p.title} (${new Date(p.announced * 1000).getFullYear()}). ${p.url}\n    ${(p.abstract || "").slice(0, 400)}`,
      )
      .join("\n");
  } catch {
    return "";
  }
}
