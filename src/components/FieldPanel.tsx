"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  BookOpen,
  Check,
  FlaskConical,
  Loader2,
  Map,
  Megaphone,
  Plus,
  RefreshCw,
} from "lucide-react";
import { fieldQuery } from "@/lib/fieldQuery";
import { newId, useStore } from "@/lib/store";
import { unseenHits } from "./FieldSync";
import type { Evidence, TreeNode } from "@/lib/types";
import { useFieldNav } from "./fieldNav";
import { useUI } from "./uiContext";

// "Field" panel: the team's box seen against the whole field, from Research Tree (the
// cross-lab literature map). Branchly is the project; Research Tree is everyone else's work.
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
  node?: string;
  branch?: string;
  source?: string;
  first_seen?: number;
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

export function toEvidence(p: FieldPaper): Evidence {
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
  const [tab, setTab] = useState<Tab | null>(isExp ? null : unseenHits(node) ? "watch" : "where");
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "where", label: "Where it sits", icon: <Map className="size-3" /> },
    { id: "tested", label: "Tested?", icon: <FlaskConical className="size-3" /> },
    { id: "read", label: "Read", icon: <BookOpen className="size-3" /> },
    {
      id: "watch",
      label: unseenHits(node) ? `Watch · ${unseenHits(node)} new` : "Watch",
      icon: <BellRing className="size-3" />,
    },
  ];
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-medium text-neutral-500">In the field</h3>
      <div className="flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(tab === t.id ? null : t.id)}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium transition ${
              tab === t.id
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
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
      <p className="flex items-center gap-1.5 text-[12px] text-neutral-500">
        <Loader2 className="size-3 animate-spin" /> {note || "Asking the field map…"}
      </p>
    );
  if (error) return <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>;
  return null;
}

/** One paper; "+ Evidence" adds it to `node` (the selected project box), if there is one. */
export function PaperRow({ paper, node, extra }: { paper: FieldPaper; node?: TreeNode; extra?: React.ReactNode }) {
  const { dispatch } = useStore();
  const nav = useFieldNav();
  const added = !!node?.evidence.some((e) => e.url === paper.url || e.paperId === paper.id);
  return (
    <div className="rounded-lg bg-neutral-100 px-3.5 py-3 text-[13px] leading-snug">
      <div className="flex items-start justify-between gap-2">
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-neutral-900 hover:underline"
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
          className="flex shrink-0 items-center gap-0.5 rounded-md border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-60"
        >
          {added ? <Check className="size-3" /> : <Plus className="size-3" />} Evidence
        </button>
      </div>
      <p className="mt-1.5 text-[12px] text-neutral-500">
        {citationOf(paper)}
        {paper.reason ? ` · ${paper.reason}` : ""}
        {paper.built_on !== undefined && (
          <span title="How many papers on the field map cite this one. 0 is neutral: new, overlooked, or a hidden gem.">
            {" · "}
            {paper.built_on ? `built on by ${paper.built_on}` : "not built on yet"}
          </span>
        )}
        {nav && (
          <>
            {" · "}
            <button onClick={() => nav.openPaper(paper.id)} className="text-neutral-900 hover:underline">
              lineage
            </button>
          </>
        )}
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
  sparse: "border-neutral-300 bg-neutral-100 text-neutral-900",
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
          <p className="text-[12px] text-neutral-500">
            {data.placement_confidence >= 0.35 ? "Sits in " : "Closest fit (no clear home): "}
            <span className="font-medium text-neutral-700">
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
            className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-900 hover:underline"
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

export function TestedCheck({
  node,
  parent,
  initial,
  target,
}: {
  node?: TreeNode;
  parent?: TreeNode;
  initial?: { problem?: string; method?: string; setting?: string };
  /** the box "+ Evidence" adds to (defaults to node) */
  target?: TreeNode;
}) {
  const isExp = node?.kind === "experiment";
  const [parts, setParts] = useState({
    problem: initial?.problem ?? (node ? (isExp ? parent?.title || "" : node.title) : ""),
    method: initial?.method ?? (node && isExp ? [node.title, node.goal].filter(Boolean).join(": ") : ""),
    setting: initial?.setting ?? "",
  });
  const evidenceBox = target ?? node;
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
        <label key={k} className="block text-[13px] font-medium text-neutral-500">
          {k}
          <input
            value={parts[k]}
            onChange={(e) => setParts({ ...parts, [k]: e.target.value })}
            placeholder={
              k === "setting"
                ? "model system, e.g. primary CLL cells, PDX mice"
                : k === "method"
                  ? "e.g. CRISPR knockout of BCL2"
                  : "e.g. venetoclax resistance in AML"
            }
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12.5px] font-normal normal-case tracking-normal text-neutral-800 focus:border-neutral-900 focus:outline-none"
          />
        </label>
      ))}
      <button
        disabled={filled < 2 || loading}
        onClick={() => {
          setRan(true);
          run();
        }}
        className="w-full rounded-lg bg-neutral-900 py-1.5 text-[12.5px] font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        Check the field (about 10 s)
      </button>
      {filled < 2 && <p className="text-[11.5px] text-neutral-500">Fill in at least two parts.</p>}
      <Status loading={loading} error={error} note="Checking each part, then reading candidate papers' sentences…" />
      {ran && data && (
        <>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-[12.5px] leading-relaxed text-neutral-800">
            {data.verdict.text}
          </div>
          {shown.map((p) => (
            <PaperRow
              key={p.id}
              paper={p}
              node={evidenceBox}
              extra={
                p.evidence && (
                  <div className="mt-1.5 space-y-1">
                    {Object.entries(p.evidence).map(([k, v]) => (
                      <p key={k} className="text-[11.5px] text-neutral-600">
                        <span className="font-semibold uppercase text-neutral-900">{k}</span> “{v.slice(0, 180)}”
                      </p>
                    ))}
                    {p.strength && (
                      <p className="text-[11px] text-neutral-400">
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

export function ReadingList({ node, query }: { node?: TreeNode; query?: string }) {
  const q = query ?? node?.title ?? "";
  const load = useCallback(
    () =>
      getJSON<{ order: string[]; sections: Record<string, FieldPaper[]>; classics: FieldPaper[] }>(
        `/api/field/reading?q=${encodeURIComponent(q)}`,
      ),
    [q],
  );
  const { data, error, loading } = useLoad(load);
  return (
    <div className="space-y-2">
      <Status loading={loading} error={error} note="Following the citation lineage…" />
      {data &&
        data.order.map((k) =>
          data.sections[k]?.length ? (
            <div key={k} className="space-y-1.5">
              <p className="text-[11.5px] font-semibold text-neutral-600">{SECTION_TITLE[k] || k}</p>
              {data.sections[k].map((p) => (
                <PaperRow key={p.id} paper={p} node={node} />
              ))}
            </div>
          ) : null,
        )}
      {data && data.classics.length > 0 && (
        <p className="text-[11.5px] text-neutral-500">
          Classics cited across the field: {data.classics.map((c) => c.title).slice(0, 3).join(" · ")}
        </p>
      )}
    </div>
  );
}

// ── report an experiment back to the field ───────────────────────────────────

const REPORT = {
  contradicted: { kind: "dead_end", verb: "Report a dead end", done: "Reported as a dead end" },
  supported: { kind: "promising", verb: "Mark the topic promising", done: "Marked promising" },
  inconclusive: { kind: "note", verb: "Leave a note", done: "Note left" },
} as const;

/**
 * After a result, one click tells every lab using the field map what happened on this topic.
 * A dead end with what failed is what saves the next lab weeks.
 */
export function ReportToField({ node, parent }: { node: TreeNode; parent?: TreeNode }) {
  const { state, dispatch } = useStore();
  const { openFieldMap } = useUI();
  const outcome = node.result?.outcome;
  const topic = parent?.fieldTopic;
  const r = outcome ? REPORT[outcome] : null;
  const [text, setText] = useState(() =>
    [parent?.title && `Idea: ${parent.title}`, `Test: ${node.title}`, node.result?.notes && `Result: ${node.result.notes}`]
      .filter(Boolean)
      .join("\n")
      .slice(0, 900),
  );
  const [who, setWho] = useState(() => {
    try {
      return localStorage.getItem("rt_who") || state.title;
    } catch {
      return state.title;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadLabel = useCallback(
    () => getJSON<{ label: string }>(`/api/field/topic?id=${encodeURIComponent(topic || "")}`).then((d) => d.label),
    [topic],
  );
  const { data: label } = useLoad(loadLabel, Boolean(topic));
  if (!r || !node.result) return null;

  if (!topic)
    return (
      <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-[12px] text-neutral-500">
        This idea has no clear home on the field map yet, so there is no topic to report the result to.
      </p>
    );

  if (node.fieldReported)
    return (
      <p className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 p-2.5 text-[12px] text-neutral-900">
        <Check className="size-3.5" /> {REPORT[outcome!].done} on <b>{label ?? "the field map"}</b>. Every lab on the map
        can see it.
        <button onClick={() => openFieldMap(topic)} className="ml-auto shrink-0 font-medium hover:underline">
          View
        </button>
      </p>
    );

  return (
    <div className="space-y-2 rounded-xl border border-neutral-300 bg-neutral-100/50 p-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-neutral-900">
        <Megaphone className="size-3.5" /> Tell the field: {r.verb.toLowerCase()} on “{label ?? "…"}”
      </p>
      <p className="text-[11.5px] text-neutral-900/70">
        {outcome === "contradicted"
          ? "Other labs working here will see what failed before they repeat it."
          : "Other labs working here will see this on the field map."}{" "}
        Edit before posting; it is public.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-[12px] focus:border-neutral-500 focus:outline-none"
      />
      <input
        value={who}
        onChange={(e) => setWho(e.target.value)}
        placeholder="Your name or lab"
        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-[12px] focus:border-neutral-500 focus:outline-none"
      />
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            localStorage.setItem("rt_who", who);
          } catch {
            /* ignore */
          }
          try {
            await getJSON("/api/field/signal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ node: topic, kind: r.kind, who: who || "anonymous", text, visibility: "public" }),
            });
            dispatch({ type: "updateNode", id: node.id, patch: { fieldReported: r.kind } });
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-1.5 text-[12.5px] font-semibold text-white hover:bg-neutral-900 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Megaphone className="size-3" />} {r.verb}
      </button>
      {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
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
  // looking at the list counts as seeing these papers (clears the "N new" badge on the box)
  const [fresh] = useState(() => new Set((node.fieldHits ?? []).filter((id) => !(node.fieldSeen ?? []).includes(id))));
  const hitIds = hits?.map((h) => h.id).join("|");
  useEffect(() => {
    if (hitIds === undefined) return;
    const ids = hitIds ? hitIds.split("|") : [];
    dispatch({ type: "updateNode", id: node.id, patch: { fieldHits: ids, fieldSeen: ids } });
  }, [hitIds, node.id, dispatch]);
  const busy = creating || loading;
  const error = createError || loadError;

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const r = await getJSON<{ token: string }>("/api/field/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: node.title, label: node.title }),
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
        <p className="text-[12px] leading-relaxed text-neutral-600">
          Watch the field for this box: every new preprint that directly addresses it is collected here
          (and in the field map&apos;s alerts). Starts with matches from the last 14 days.
        </p>
        <button
          onClick={create}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-1.5 text-[12.5px] font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <BellRing className="size-3" />} Watch the field for this
        </button>
        {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
      </div>
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px] text-neutral-600">
        <span>
          Watching. <b>{hits?.length ?? "…"}</b> matching papers so far.
        </span>
        <button
          onClick={refresh}
          className="flex items-center gap-1 text-neutral-900 hover:underline"
          disabled={busy}
        >
          <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} /> Check now
        </button>
      </div>
      {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
      {hits?.slice(0, 8).map((p) => (
        <PaperRow
          key={p.id}
          paper={p}
          node={node}
          extra={fresh.has(p.id) && <span className="mt-1 inline-block rounded bg-rose-600 px-1 text-[10px] font-bold text-white">new</span>}
        />
      ))}
    </div>
  );
}

// ── crowded? say why, and what to do about it ────────────────────────────────

interface CrowdingCheck {
  verdict: "answered" | "partly" | "open";
  summary: string;
  gap: string;
  options: { title: string; why: string }[];
}

const VERDICT = {
  answered: { label: "Already answered", cls: "bg-neutral-900 text-white" },
  partly: { label: "Partly answered", cls: "bg-amber-100 text-amber-900" },
  open: { label: "Still open", cls: "bg-neutral-100 text-neutral-800" },
} as const;

/**
 * Shown on boxes the field map marks crowded or related: the papers that most directly address
 * the box, a check of how much they actually answer, and (for editors) fold it or sharpen it.
 */
export function CrowdingSection({ node, parent }: { node: TreeNode; parent?: TreeNode }) {
  const { dispatch, canEdit } = useStore();
  const query = fieldQuery(node, parent);
  const load = useCallback(
    () => getJSON<{ addressing?: FieldPaper[]; directly_relevant?: number | null }>(`/api/field/locate?q=${encodeURIComponent(query)}`),
    [query],
  );
  const { data, error, loading } = useLoad(load);
  const papers = (data?.addressing ?? []).slice(0, 3);
  const [check, setCheck] = useState<CrowdingCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const crowded = node.fieldNovelty === "crowded";

  const runCheck = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      setCheck(
        await getJSON<CrowdingCheck>("/api/crowding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: node.title,
            context: parent?.title,
            papers: papers.map((p) => ({ title: p.title, abstract: p.abstract, citation: citationOf(p) })),
          }),
        }),
      );
    } catch (e) {
      setCheckError(message(e));
    } finally {
      setChecking(false);
    }
  };

  const keepPapers = () => {
    for (const p of papers.slice(0, 2))
      if (!node.evidence.some((e) => e.paperId === p.id || e.url === p.url))
        dispatch({ type: "addEvidence", id: node.id, evidence: toEvidence(p) });
  };
  const fold = () => {
    keepPapers();
    dispatch({
      type: "setFolded",
      id: node.id,
      folded: true,
      reason: `Already answered in the literature: ${papers.slice(0, 2).map(citationOf).join("; ")}.${check?.summary ? ` ${check.summary}` : ""}`,
    });
  };
  const reword = (o: { title: string; why: string }) => {
    keepPapers();
    dispatch({
      type: "updateNode",
      id: node.id,
      patch: {
        title: o.title,
        rationale: [node.rationale, `Sharpened after a literature check: “${node.title}” was largely covered (${papers.slice(0, 2).map(citationOf).join("; ")}). ${o.why}`]
          .filter(Boolean)
          .join("\n\n"),
        fieldNovelty: undefined, // re-checked against the field map with the new wording
      },
    });
    setDone("Reworded. The field map is re-checking it now.");
    setCheck(null);
  };
  const addAlongside = (o: { title: string; why: string }) => {
    const id = newId();
    dispatch({
      type: "addNode",
      select: false,
      node: {
        id,
        parentId: node.parentId ?? "root",
        kind: "hypothesis",
        status: "untested",
        title: o.title,
        lens: "Less covered",
        rationale: `${o.why} Suggested as a less covered alternative to “${node.title}”.`,
        confidence: node.confidence ?? 0.7,
        evidence: [],
      },
    });
    setDone("Added next to this box.");
  };

  if (node.kind === "suggestion" || node.kind === "experiment" || node.folded) return null;
  if (!error && !loading && papers.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-neutral-300 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-neutral-900">Already in the literature?</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${crowded ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}>
          {crowded ? "crowded" : "related"} · {node.fieldRelevant ?? data?.directly_relevant ?? "?"} of 20
        </span>
      </div>
      <p className="text-[12.5px] leading-relaxed text-neutral-500">
        {node.fieldRelevant ?? data?.directly_relevant ?? "Several"} of the 20 closest papers on the field map directly address this box.
        These address it most directly:
      </p>
      <Status loading={loading} error={error} />
      {papers.map((p) => (
        <PaperRow key={p.id} paper={p} node={canEdit ? node : undefined} />
      ))}

      {papers.length > 0 && !check && (
        <button
          onClick={runCheck}
          disabled={checking}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-[13px] font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-60"
        >
          {checking ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpen className="size-3.5" />}
          {checking ? "Reading these papers…" : "Check what's already answered"}
        </button>
      )}
      {checkError && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{checkError}</p>}
      {done && <p className="flex items-center gap-1.5 text-[12.5px] text-neutral-700"><Check className="size-3.5" /> {done}</p>}

      {check && (
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-lg bg-neutral-100 p-3 text-[13px] leading-relaxed text-neutral-800">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT[check.verdict].cls}`}>
              {VERDICT[check.verdict].label}
            </span>
            <p>{check.summary}</p>
            {check.gap && (
              <p className="text-neutral-600">
                <b className="font-medium text-neutral-900">Gap: </b>
                {check.gap}
              </p>
            )}
          </div>
          {canEdit && check.verdict === "answered" && (
            <button
              onClick={fold}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-900 py-2 text-[13px] font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              Fold it: already answered
            </button>
          )}
          {check.options.length > 0 && (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-neutral-500">Sharper versions, aimed at the gap</p>
              {check.options.map((o, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-neutral-200 p-3">
                  <p className="text-[13px] font-medium leading-snug text-neutral-900">{o.title}</p>
                  <p className="text-[12px] leading-relaxed text-neutral-500">{o.why}</p>
                  {canEdit && (
                    <div className="flex gap-1.5">
                      <button onClick={() => reword(o)} className="rounded-md bg-neutral-900 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-neutral-700">
                        Use this wording
                      </button>
                      <button onClick={() => addAlongside(o)} className="rounded-md border border-neutral-300 px-2.5 py-1 text-[12px] font-medium text-neutral-800 hover:border-neutral-900">
                        Add alongside
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && check.verdict !== "answered" && (
            <button onClick={fold} className="text-[12px] text-neutral-500 underline decoration-dotted hover:text-neutral-900">
              Fold it anyway as already answered
            </button>
          )}
        </div>
      )}
    </section>
  );
}
