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
        "cd research-tree && RT_FIELD=cancer_cell_bio python3 server.py",
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Research Tree error ${res.status}`);
  return body as T;
}

export const fieldUrl = (q?: string) => (q ? `${BASE}/?q=${encodeURIComponent(q)}` : BASE);

export function status() {
  return call<{ field: string; coverage: string; papers: number }>("/api/status");
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

export function createWatch(query: string) {
  return call<{ token: string; feed: string; view: string }>("/api/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "idea", query }),
  }, 120_000);
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
