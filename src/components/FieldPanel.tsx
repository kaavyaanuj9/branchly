"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  BookOpen,
  Check,
  FlaskConical,
  Loader2,
  Map,
  Plus,
  RefreshCw,
} from "lucide-react";
import { fieldQuery } from "@/lib/fieldQuery";
import { useStore } from "@/lib/store";
import type { Evidence, TreeNode } from "@/lib/types";
import { useUI } from "./uiContext";

// "Field" panel: the team's box seen against the whole field, from Research Tree (the
// cross-lab literature map). HypoTree is the project; Research Tree is everyone else's work.
//   Where it sits  - path on the field map, how crowded it is, the closest papers
//   Tested?        - has this problem + method (+ setting) combination been done?
//   Read           - reading list from the citation lineage around the idea
//   Watch          - an alert: new papers that directly address this box

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

type Tab = "where" | "tested" | "read" | "watch";

const year = (ts: number) => new Date(ts * 1000).getFullYear();

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

function citationOf(p: FieldPaper) {
  const first = (p.authors?.[0] || "Unknown").replace(/,.*$/, "").split(" ").slice(-1)[0];
  return `${first}${(p.authors?.length || 0) > 1 ? " et al." : ""} (${year(p.announced)})`;
}

function toEvidence(p: FieldPaper): Evidence {
  const quote = p.evidence ? Object.values(p.evidence)[0] : undefined;
  const firstSentences = (p.abstract || "").split(/(?<=\.)\s+/).slice(0, 2).join(" ");
  return {
    text: quote || firstSentences || p.title,
    citation: citationOf(p),
    url: p.url,
    year: year(p.announced),
    paperId: p.id,
  };
}

export function FieldPanel({ node, parent }: { node: TreeNode; parent?: TreeNode }) {
  const isExp = node.kind === "experiment";
  const [tab, setTab] = useState<Tab | null>(isExp ? null : "where");
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "where", label: "Where it sits", icon: <Map className="size-3" /> },
    { id: "tested", label: "Tested?", icon: <FlaskConical className="size-3" /> },
    { id: "read", label: "Read", icon: <BookOpen className="size-3" /> },
    { id: "watch", label: "Watch", icon: <BellRing className="size-3" /> },
  ];
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        In the field
      </h3>
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(tab === t.id ? null : t.id)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium transition ${
              tab === t.id
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === "where" && <WhereItSits node={node} parent={parent} />}
      {tab === "tested" && <TestedCheck node={node} parent={parent} />}
      {tab === "read" && <ReadingList node={node} />}
      {tab === "watch" && <WatchField node={node} />}
    </section>
  );
}

// ── shared pieces ────────────────────────────────────────────────────────────

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Fetch on mount (auto) or on demand (run). Panels remount per box, so no reset is needed. */
function useLoad<T>(load: () => Promise<T>, auto = true) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: auto,
  });
  useEffect(() => {
    if (!auto) return;
    let live = true;
    load().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e) => live && setState({ data: null, error: message(e), loading: false }),
    );
    return () => {
      live = false;
    };
  }, [auto, load]);
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    load().then(
      (data) => setState({ data, error: null, loading: false }),
      (e) => setState({ data: null, error: message(e), loading: false }),
    );
  }, [load]);
  return { ...state, run };
}

function Status({ loading, error, note }: { loading: boolean; error: string | null; note?: string }) {
  if (loading)
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
        <Loader2 className="size-3 animate-spin" /> {note || "Asking the field map…"}
      </p>
    );
  if (error) return <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>;
  return null;
}

/** One paper; "+ Evidence" adds it to `node` (the selected project box), if there is one. */
export function PaperRow({ paper, node, extra }: { paper: FieldPaper; node?: TreeNode; extra?: React.ReactNode }) {
  const { dispatch } = useStore();
  const added = !!node?.evidence.some((e) => e.url === paper.url || e.paperId === paper.id);
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-[12.5px] leading-snug">
      <div className="flex items-start justify-between gap-2">
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-slate-800 hover:text-emerald-700 hover:underline"
        >
          {paper.title}
        </a>
        <button
          disabled={added || !node}
          onClick={() => node && dispatch({ type: "addEvidence", id: node.id, evidence: toEvidence(paper) })}
          title={
            !node
              ? "Select a box in the project tree first"
              : added
                ? "Already in this box's evidence"
                : `Add to the evidence of "${node.title.slice(0, 60)}"`
          }
          className="flex shrink-0 items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
        >
          {added ? <Check className="size-3" /> : <Plus className="size-3" />} Evidence
        </button>
      </div>
      <p className="mt-1 text-[11.5px] text-slate-500">
        {citationOf(paper)}
        {paper.reason ? ` · ${paper.reason}` : ""}
      </p>
      {extra}
    </div>
  );
}

// ── where it sits ────────────────────────────────────────────────────────────

interface LocateResult {
  node: string;
  path: { id: string; label: string }[];
  novelty_level: "crowded" | "related" | "sparse";
  novelty_hint: string;
  directly_relevant: number | null;
  placement_confidence: number;
  nearest: FieldPaper[];
}

const NOVELTY_STYLE = {
  crowded: "border-amber-200 bg-amber-50 text-amber-900",
  related: "border-sky-200 bg-sky-50 text-sky-900",
  sparse: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

function WhereItSits({ node, parent }: { node: TreeNode; parent?: TreeNode }) {
  // same query as the field map uses to place this box, so the two always agree
  const query = fieldQuery(node, parent);
  const load = useCallback(
    () => getJSON<LocateResult>(`/api/field/locate?q=${encodeURIComponent(query)}`),
    [query],
  );
  const { data, error, loading } = useLoad(load);
  const { openFieldMap } = useUI();
  return (
    <div className="space-y-2">
      <Status loading={loading} error={error} />
      {data && (
        <>
          <p className="text-[12px] text-slate-500">
            {data.placement_confidence >= 0.35 ? "Sits in " : "Closest fit (no clear home): "}
            <span className="font-medium text-slate-700">
              {data.path.slice(1).map((p) => p.label).join(" › ")}
            </span>
          </p>
          <div className={`rounded-lg border p-2.5 text-[12.5px] leading-relaxed ${NOVELTY_STYLE[data.novelty_level]}`}>
            {data.novelty_hint}
          </div>
          {data.nearest.slice(0, 5).map((p) => (
            <PaperRow key={p.id} paper={p} node={node} />
          ))}
          <button
            onClick={() => openFieldMap(data.node)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 hover:underline"
          >
            Show on the field map <Map className="size-3" />
          </button>
        </>
      )}
    </div>
  );
}

// ── has this been tested? ────────────────────────────────────────────────────

interface AspectsResult {
  verdict: { kind: string; text: string };
  combos: { parts: string[]; count: number; strong: number; papers: FieldPaper[]; closest: FieldPaper[] }[];
}

function TestedCheck({ node, parent }: { node: TreeNode; parent?: TreeNode }) {
  const isExp = node.kind === "experiment";
  const [parts, setParts] = useState({
    problem: isExp ? parent?.title || "" : node.title,
    method: isExp ? [node.title, node.goal].filter(Boolean).join(": ") : "",
    setting: "",
  });
  const [ran, setRan] = useState(false);
  const load = useCallback(
    () =>
      getJSON<AspectsResult>(
        `/api/field/aspects?${new URLSearchParams(Object.entries(parts).filter(([, v]) => v.trim()))}`,
      ),
    [parts],
  );
  const { data, error, loading, run } = useLoad(load, false);
  const filled = Object.values(parts).filter((v) => v.trim()).length;
  const full = data?.combos[data.combos.length - 1];
  const shown = full ? (full.papers.length ? full.papers : full.closest) : [];
  return (
    <div className="space-y-2">
      {(["problem", "method", "setting"] as const).map((k) => (
        <label key={k} className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {k}
          <input
            value={parts[k]}
            onChange={(e) => setParts({ ...parts, [k]: e.target.value })}
            placeholder={
              k === "setting" ? "model system, e.g. primary CLL cells, PDX mice" : k === "method" ? "e.g. CRISPR knockout of BCL2" : ""
            }
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12.5px] font-normal normal-case tracking-normal text-slate-800 focus:border-emerald-400 focus:outline-none"
          />
        </label>
      ))}
      <button
        disabled={filled < 2 || loading}
        onClick={() => {
          setRan(true);
          run();
        }}
        className="w-full rounded-lg bg-emerald-600 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Check the field (about 10 s)
      </button>
      {filled < 2 && <p className="text-[11.5px] text-slate-500">Fill in at least two parts.</p>}
      <Status loading={loading} error={error} note="Checking each part, then reading candidate papers' sentences…" />
      {ran && data && (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[12.5px] leading-relaxed text-slate-800">
            {data.verdict.text}
          </div>
          {shown.map((p) => (
            <PaperRow
              key={p.id}
              paper={p}
              node={node}
              extra={
                p.evidence && (
                  <div className="mt-1.5 space-y-1">
                    {Object.entries(p.evidence).map(([k, v]) => (
                      <p key={k} className="text-[11.5px] text-slate-600">
                        <span className="font-semibold uppercase text-emerald-700">{k}</span> “{v.slice(0, 180)}”
                      </p>
                    ))}
                    {p.strength && (
                      <p className="text-[11px] text-slate-400">
                        {p.strength === "strong" ? "strong match" : p.strength === "possible" ? "possible match" : "below the match bar"}
                      </p>
                    )}
                  </div>
                )
              }
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── reading list ─────────────────────────────────────────────────────────────

const SECTION_TITLE: Record<string, string> = {
  foundations: "Foundations: what the closest work builds on",
  closest: "Closest work",
  newest: "Newest in this neighbourhood",
};

function ReadingList({ node }: { node: TreeNode }) {
  const load = useCallback(
    () =>
      getJSON<{ order: string[]; sections: Record<string, FieldPaper[]>; classics: FieldPaper[] }>(
        `/api/field/reading?q=${encodeURIComponent(node.title)}`,
      ),
    [node.title],
  );
  const { data, error, loading } = useLoad(load);
  return (
    <div className="space-y-2">
      <Status loading={loading} error={error} note="Following the citation lineage…" />
      {data &&
        data.order.map((k) =>
          data.sections[k]?.length ? (
            <div key={k} className="space-y-1.5">
              <p className="text-[11.5px] font-semibold text-slate-600">{SECTION_TITLE[k] || k}</p>
              {data.sections[k].map((p) => (
                <PaperRow key={p.id} paper={p} node={node} />
              ))}
            </div>
          ) : null,
        )}
      {data && data.classics.length > 0 && (
        <p className="text-[11.5px] text-slate-500">
          Classics cited across the field: {data.classics.map((c) => c.title).slice(0, 3).join(" · ")}
        </p>
      )}
    </div>
  );
}

// ── watch the field ──────────────────────────────────────────────────────────

function WatchField({ node }: { node: TreeNode }) {
  const { dispatch } = useStore();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const token = node.fieldWatch;
  const load = useCallback(
    () =>
      getJSON<{ hits: (FieldPaper & { matched: number })[] }>(
        `/api/field/watch?token=${encodeURIComponent(token || "")}`,
      ).then((v) => v.hits),
    [token],
  );
  const { data: hits, error: loadError, loading, run: refresh } = useLoad(load, Boolean(token));
  const busy = creating || loading;
  const error = createError || loadError;

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const r = await getJSON<{ token: string }>("/api/field/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: node.title }),
      });
      dispatch({ type: "updateNode", id: node.id, patch: { fieldWatch: r.token } });
    } catch (e) {
      setCreateError(message(e));
    } finally {
      setCreating(false);
    }
  };

  if (!node.fieldWatch)
    return (
      <div className="space-y-2">
        <p className="text-[12px] leading-relaxed text-slate-600">
          Watch the field for this box: every new preprint that directly addresses it is collected here
          (and in the field map&apos;s alerts). Starts with matches from the last 14 days.
        </p>
        <button
          onClick={create}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <BellRing className="size-3" />} Watch the field for this
        </button>
        {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
      </div>
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px] text-slate-600">
        <span>
          Watching. <b>{hits?.length ?? "…"}</b> matching papers so far.
        </span>
        <button
          onClick={refresh}
          className="flex items-center gap-1 text-emerald-700 hover:underline"
          disabled={busy}
        >
          <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} /> Check now
        </button>
      </div>
      {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
      {hits?.slice(0, 8).map((p) => (
        <PaperRow key={p.id} paper={p} node={node} />
      ))}
    </div>
  );
}
