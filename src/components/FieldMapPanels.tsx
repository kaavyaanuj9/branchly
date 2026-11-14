"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  BellRing,
  BookOpen,
  Check,
  FlaskConical,
  GitFork,
  Hand,
  Loader2,
  Map as MapIcon,
  NotebookPen,
  Sparkles,
  Sprout,
  GitBranchPlus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { newId, useStore } from "@/lib/store";
import { createTree } from "@/lib/teams";
import { useTeamContext } from "./teamContext";
import type { TreeNode } from "@/lib/types";
import { PaperRow, ReadingList, TestedCheck, toEvidence, type FieldPaper } from "./FieldPanel";
import { loadAlerts, useFieldNav, type SavedAlert } from "./fieldNav";
import { useUI } from "./uiContext";

// Side panels of the field map (everything the stand-alone Research Tree page offers):
// overview with open frontiers and the live feed, idea search, paper details, alerts, and the
// "who's working on what" signals on each topic.

export async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ago(ts?: number) {
  if (!ts) return "never";
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export interface FieldItem {
  id: string;
  label: string;
  depth: number;
  branch?: string;
  keywords?: string[];
  count: number;
  n7: number;
  n14?: number;
  newest?: number;
  momentum: number;
  weeks?: number[];
  opportunity?: number;
  signals?: Record<"claim" | "promising" | "dead_end" | "note" | "done", number>;
  tips?: FieldPaper[];
  children?: FieldItem[];
  status?: FieldStatus;
}

export interface FieldStatus {
  field?: string;
  coverage?: string;
  papers?: number;
  last_poll?: number;
  last_error?: string | null;
  continuous?: boolean;
  next_announcement?: number;
}

export function leavesOf(n: FieldItem): FieldItem[] {
  return n.children?.length ? n.children.flatMap(leavesOf) : [n];
}

export function Panel({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-neutral-200 bg-white xl:w-[360px]">
      <div className="flex items-center justify-between px-6 pt-5">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-500">
          {icon} {title}
        </span>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" title="Close">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6 pt-3.5">{children}</div>
    </aside>
  );
}

export const H3 = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <h3 className={`text-[13px] font-medium text-neutral-500 ${className}`}>{children}</h3>
);

export function Sparkline({ weeks }: { weeks: number[] }) {
  const max = Math.max(1, ...weeks);
  return (
    <svg viewBox={`0 0 ${weeks.length * 7} 22`} className="h-[22px] w-full" aria-label="papers per week, last 8 weeks">
      {weeks.map((w, i) => (
        <rect key={i} x={i * 7 + 1} y={22 - (20 * w) / max - 1} width={5} height={(20 * w) / max + 1} rx={1} fill="#404040" fillOpacity={0.35 + (0.65 * i) / weeks.length} />
      ))}
    </svg>
  );
}

// ── overview: the frontier at a glance ───────────────────────────────────────

export function OverviewPanel({
  root,
  feed,
  colorOf,
  onClose,
}: {
  root: FieldItem;
  feed: FieldPaper[];
  colorOf: (branch: string) => string;
  onClose: () => void;
}) {
  const nav = useFieldNav();
  const { state } = useStore();
  const box = state.nodes.find((n) => n.id === state.selectedId);
  const leaves = leavesOf(root);
  const frontiers = [...leaves]
    .sort(
      (a, b) =>
        (b.opportunity ?? 0) - (a.opportunity ?? 0) || (b.n14 ?? 0) - (a.n14 ?? 0) || (b.newest ?? 0) - (a.newest ?? 0),
    )
    .slice(0, 8);
  const maxO = Math.max(1e-9, ...frontiers.map((l) => l.opportunity ?? 0));
  const branchLabel = (id?: string) => root.children?.find((b) => b.id === id)?.label ?? "";

  // "Just in": live arrivals, else the newest announcement day, spread across branches
  let justIn = feed.slice(0, 8);
  if (!justIn.length) {
    const tips = leaves
      .flatMap((l) => (l.tips ?? []).map((t) => ({ ...t, branch: t.branch ?? l.branch, node: t.node ?? l.id })))
      .sort((a, b) => b.announced - a.announced);
    const seen = new Set<string>();
    justIn = tips.filter((t) => !seen.has(t.branch ?? "") && seen.add(t.branch ?? "")).slice(0, 6);
  }

  return (
    <Panel title="Field overview" icon={<MapIcon className="size-3.5" />} onClose={onClose}>
      <div className="space-y-1.5">
        <h2 className="text-[21px] font-semibold leading-[1.25] tracking-[-0.01em] text-neutral-950">{root.label}</h2>
        <p className="text-[12.5px] leading-relaxed text-neutral-500">
          {root.count.toLocaleString()} papers ({root.status?.coverage}), organised into {root.children?.length} curated
          branches and {leaves.length} automatically grown topics. New preprints are placed on the map as soon as they
          are public.
        </p>
      </div>

      <section className="space-y-1.5">
        <H3>Just in</H3>
        {justIn.map((p) => (
          <PaperRow
            key={p.id}
            paper={p}
            node={box}
            extra={
              p.node && (
                <button onClick={() => nav?.openTopic(p.node!)} className="mt-1 text-[11px] text-neutral-500 hover:text-neutral-900">
                  in {branchLabel(p.branch)} ›
                </button>
              )
            }
          />
        ))}
      </section>

      <section className="space-y-1.5">
        <H3>Open frontiers</H3>
        <p className="text-[11.5px] text-neutral-500">
          Ranked by recent activity × acceleration, discounted where people have claimed the topic or marked it a dead end.
        </p>
        {frontiers.map((l) => (
          <button
            key={l.id}
            onClick={() => nav?.openTopic(l.id)}
            className="block w-full rounded-lg border border-neutral-100 bg-neutral-50/70 p-2.5 text-left hover:border-neutral-300"
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: colorOf(l.branch ?? "") }}>
              {branchLabel(l.branch)}
            </p>
            <p className="text-[12.5px] font-medium text-neutral-800">{l.label}</p>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-neutral-500">
              <span>{l.n14 ?? 0} new in 14 d</span>
              <span>{l.momentum}× usual pace</span>
              <span>{l.count} total</span>
              <span className={l.signals?.claim ? "font-medium text-neutral-900" : ""}>
                {l.signals?.claim ? `${l.signals.claim} claimed` : "unclaimed"}
              </span>
              {!!l.signals?.dead_end && <span className="text-rose-600">{l.signals.dead_end} dead end</span>}
            </p>
            <div className="mt-1.5 h-1 rounded-full bg-neutral-200">
              <div className="h-1 rounded-full bg-neutral-1000" style={{ width: `${(100 * (l.opportunity ?? 0)) / maxO}%` }} />
            </div>
          </button>
        ))}
      </section>

      <section className="space-y-1">
        <H3>Branches by activity this week</H3>
        {[...(root.children ?? [])]
          .sort((a, b) => b.n7 - a.n7 || b.count - a.count)
          .map((b) => (
            <button
              key={b.id}
              onClick={() => nav?.openTopic(b.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-neutral-700 hover:bg-neutral-50"
            >
              <span className="flex items-center gap-2">
                <i className="inline-block size-2.5 rounded-full" style={{ background: colorOf(b.id) }} />
                {b.label}
              </span>
              <span className="shrink-0 text-[11px] text-neutral-400">
                {b.count} · +{b.n7}/wk · {b.momentum}×
              </span>
            </button>
          ))}
      </section>
    </Panel>
  );
}

// ── idea search: where it sits, read, tested?, watch ─────────────────────────

interface LocateResult {
  node: string;
  path: { id: string; label: string }[];
  novelty_level: "crowded" | "related" | "sparse";
  novelty_hint: string;
  placement_confidence: number;
  directly_relevant?: number | null;
  bridge?: { id: string; label: string } | null;
  nearest: FieldPaper[];
}

const NOVELTY_STYLE = {
  crowded: "border-amber-200 bg-amber-50 text-amber-900",
  related: "border-sky-200 bg-sky-50 text-sky-900",
  sparse: "border-neutral-300 bg-neutral-100 text-neutral-900",
};

type IdeaTab = "closest" | "read" | "tested" | "watch";

export function IdeaPanel({
  q,
  located,
  onClose,
  onAlert,
}: {
  q: string;
  located: LocateResult | null;
  onClose: () => void;
  onAlert: (a: SavedAlert) => void;
}) {
  const nav = useFieldNav();
  const { state } = useStore();
  const box = state.nodes.find((n) => n.id === state.selectedId);
  const [tab, setTab] = useState<IdeaTab>("closest");
  const tabs: { id: IdeaTab; label: string; icon: React.ReactNode }[] = [
    { id: "closest", label: "Closest", icon: <MapIcon className="size-3" /> },
    { id: "read", label: "What to read", icon: <BookOpen className="size-3" /> },
    { id: "tested", label: "Tested?", icon: <FlaskConical className="size-3" /> },
    { id: "watch", label: "Alert me", icon: <BellRing className="size-3" /> },
  ];
  return (
    <Panel title="Your idea on the map" icon={<MapIcon className="size-3.5" />} onClose={onClose}>
      <p className="rounded-lg bg-neutral-50 p-2.5 text-[12.5px] italic leading-relaxed text-neutral-700">“{q}”</p>
      {!located ? (
        <p className="flex items-center gap-1.5 text-[12px] text-neutral-500">
          <Loader2 className="size-3 animate-spin" /> Locating…
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-[12px] text-neutral-500">
              {located.placement_confidence >= 0.35
                ? "Lands in "
                : `Closest fit, but no clear home (only ${Math.round(located.placement_confidence * 100)}% of its nearest papers sit here): `}
              <button onClick={() => nav?.openTopic(located.node)} className="text-left font-medium text-neutral-800 hover:text-neutral-900">
                {located.path.slice(1).map((p) => p.label).join(" › ")}
              </button>
            </p>
            {located.bridge && (
              <p className="text-[12px] text-neutral-500">
                Also close to <b>{located.bridge.label}</b>, so it bridges two branches.
              </p>
            )}
            <div className={`rounded-lg border p-2.5 text-[12.5px] leading-relaxed ${NOVELTY_STYLE[located.novelty_level]}`}>
              {located.novelty_hint}
            </div>
          </div>
          <BringToProject q={q} located={located} />
          <div className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-medium transition ${
                  tab === t.id
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:text-neutral-900"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          {tab === "closest" && (
            <section className="space-y-1.5">
              <p className="text-[11.5px] text-neutral-500">
                {box ? <><b>+ Evidence</b> adds to “{box.title.slice(0, 70)}”.</> : "Select a box in the project tree to add papers to its evidence."}
              </p>
              {located.nearest.map((p) => (
                <PaperRow key={p.id} paper={p} node={box} />
              ))}
            </section>
          )}
          {tab === "read" && <ReadingList query={q} node={box} />}
          {tab === "tested" && <TestedCheck initial={{ problem: q }} target={box} />}
          {tab === "watch" && <CreateAlert spec={{ query: q }} label={q} onCreated={onAlert} />}
        </>
      )}
    </Panel>
  );
}

// ── from the field map into Branchly ─────────────────────────────────────────

/** Turn an idea found on the field map into a hypothesis tree, or a box in the current one. */
function BringToProject({ q, located }: { q: string; located: LocateResult }) {
  const { state, dispatch, canEdit } = useStore();
  const { setView } = useUI();
  const { team, uid } = useTeamContext();
  const router = useRouter();
  const [claim, setClaim] = useState(true);
  const [busy, setBusy] = useState<"new" | "add" | null>(null);
  const box = state.nodes.find((n) => n.id === state.selectedId);
  const parent = canEdit && box && (box.kind === "root" || box.kind === "hypothesis") && !box.folded ? box : null;
  const home = located.placement_confidence >= 0.35;
  const fieldBits = {
    fieldTopic: home ? located.node : undefined,
    fieldNoHome: !home,
    fieldNovelty: located.novelty_level,
    fieldRelevant: located.directly_relevant ?? undefined,
  };
  const evidence = located.nearest.slice(0, 3).map(toEvidence);

  // the alert and (optionally) a private claim on the topic: best effort, never blocks
  const tellTheField = async () => {
    const watch = await getJSON<{ token: string }>("/api/field/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, label: q }),
    }).catch(() => null);
    if (claim && home)
      await getJSON("/api/field/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node: located.node, kind: "claim", who: team.personal ? state.title : team.name, text: q, visibility: "private" }),
      }).catch(() => null);
    return watch?.token;
  };

  const startTree = async () => {
    setBusy("new");
    const token = await tellTheField();
    // a new tree in the same team, opened right away
    const id = await createTree(team.id, uid, q.length > 90 ? q.slice(0, 87) + "…" : q, [
        {
          id: "root",
          parentId: null,
          kind: "root",
          title: q,
          status: "untested",
          rationale: `Started from the field map: ${located.path.slice(1).map((p) => p.label).join(" › ")}. ${located.novelty_hint}`,
          evidence,
          fieldWatch: token,
          fieldTopicFor: q,
          ...fieldBits,
        },
    ]).catch((e) => {
      console.error("Couldn't create the tree", e);
      return null;
    });
    setBusy(null);
    if (id) router.push(`/teams/${team.id}/trees/${id}`);
  };

  const addUnder = async () => {
    if (!parent) return;
    setBusy("add");
    const token = await tellTheField();
    const id = newId();
    dispatch({
      type: "addNode",
      select: true,
      node: {
        id,
        parentId: parent.id,
        kind: "hypothesis",
        title: q,
        status: "untested",
        rationale: `Found on the field map (${located.path.slice(1).map((p) => p.label).join(" › ")}). ${located.novelty_hint}`,
        evidence,
        fieldWatch: token,
        // placed again with its new parent as context
        fieldNovelty: located.novelty_level,
        fieldRelevant: located.directly_relevant ?? undefined,
      },
    });
    setBusy(null);
    setView("project");
  };

  return (
    <section className="space-y-2 rounded-xl border border-neutral-300 bg-neutral-100/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900">Take it into Branchly</p>
      <button
        onClick={startTree}
        disabled={!!busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-[12.5px] font-semibold text-white hover:bg-neutral-900 disabled:opacity-60"
      >
        {busy === "new" ? <Loader2 className="size-3.5 animate-spin" /> : <Sprout className="size-3.5" />}
        Start a new hypothesis tree from this
      </button>
      {parent && (
        <button
          onClick={addUnder}
          disabled={!!busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white py-1.5 text-[12px] font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-60"
        >
          {busy === "add" ? <Loader2 className="size-3.5 animate-spin" /> : <GitBranchPlus className="size-3.5" />}
          Add under “{parent.title.slice(0, 48)}{parent.title.length > 48 ? "…" : ""}”
        </button>
      )}
      <p className="text-[11px] leading-relaxed text-neutral-900/70">
        Brings along the 3 closest papers as evidence and an alert for new ones. The new tree goes in{" "}
        {team.personal ? "your personal space" : team.name}; this one stays as it is.
      </p>
      {home && (
        <label className="flex items-start gap-1.5 text-[11.5px] text-neutral-900/80">
          <input type="checkbox" checked={claim} onChange={(e) => setClaim(e.target.checked)} className="mt-0.5" />
          Let the field know a team is working here (private: counted on the map, your name isn&apos;t shown)
        </label>
      )}
    </section>
  );
}

export function ComboPanel({ onClose, examples }: { onClose: () => void; examples?: Record<string, string> }) {
  const { state } = useStore();
  const box = state.nodes.find((n) => n.id === state.selectedId);
  return (
    <Panel title="Has this combination been studied?" icon={<FlaskConical className="size-3.5" />} onClose={onClose}>
      <p className="text-[12.5px] leading-relaxed text-neutral-600">
        Name each part briefly (any two or three). Each part is checked on its own, then the map reads the candidate
        papers&apos; sentences to see whether any combines them.
        {examples?.problem && (
          <span className="mt-1 block text-[11.5px] text-neutral-400">
            e.g. {examples.problem} + {examples.method} + {examples.setting}
          </span>
        )}
      </p>
      <TestedCheck target={box} />
    </Panel>
  );
}

// ── alerts ───────────────────────────────────────────────────────────────────

export function CreateAlert({
  spec,
  label,
  onCreated,
}: {
  spec: { query?: string; node?: string };
  label: string;
  onCreated: (a: SavedAlert) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = loadAlerts().find((a) => (spec.node ? a.node === spec.node : a.label === label));
  const [done, setDone] = useState(Boolean(existing));
  if (done)
    return (
      <p className="flex items-center gap-1.5 rounded-md bg-neutral-100 p-2 text-[12px] text-neutral-900">
        <Check className="size-3.5" /> Watching. New matching papers collect under <b>Alerts</b> (top right).
      </p>
    );
  return (
    <div className="space-y-1.5">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const r = await getJSON<{ token: string }>("/api/field/watch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...spec, label }),
            });
            onCreated({ token: r.token, label, kind: spec.node ? "topic" : "idea", node: spec.node, created: Date.now() / 1000 });
            setDone(true);
          } catch (e) {
            setError(msg(e));
          } finally {
            setBusy(false);
          }
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-900 py-1.5 text-[12.5px] font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <BellRing className="size-3" />}
        {spec.node ? "Alert me about new papers here" : "Alert me about new papers like this"}
      </button>
      {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
    </div>
  );
}

export function AlertsPanel({
  alerts,
  onStop,
  onClose,
}: {
  alerts: SavedAlert[];
  onStop: (token: string) => void;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const { setView } = useUI();
  const boxWatches = state.nodes.filter((n) => n.fieldWatch);
  const all: (SavedAlert & { box?: TreeNode })[] = [
    ...boxWatches.map((n) => ({ token: n.fieldWatch!, label: n.title, kind: "idea" as const, created: 0, box: n })),
    ...alerts,
  ];
  return (
    <Panel title="Alerts" icon={<BellRing className="size-3.5" />} onClose={onClose}>
      {!all.length && (
        <p className="text-[12.5px] leading-relaxed text-neutral-500">
          No alerts yet. Search an idea or open a topic and choose <b>Alert me</b>, or use <b>Watch</b> on a box in the
          project tree. New preprints that match are collected here as they appear.
        </p>
      )}
      {all.map((a) => (
        <AlertRow
          key={a.token}
          alert={a}
          onOpenBox={
            a.box
              ? () => {
                  dispatch({ type: "select", id: a.box!.id });
                  setView("project");
                }
              : undefined
          }
          onStop={() => {
            fetch("/api/field/unwatch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: a.token }),
            }).catch(() => {});
            if (a.box) dispatch({ type: "updateNode", id: a.box.id, patch: { fieldWatch: undefined } });
            else onStop(a.token);
          }}
        />
      ))}
    </Panel>
  );
}

function AlertRow({ alert, onStop, onOpenBox }: { alert: SavedAlert; onStop: () => void; onOpenBox?: () => void }) {
  const nav = useFieldNav();
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<FieldPaper[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    getJSON<{ hits: FieldPaper[] }>(`/api/field/watch?token=${encodeURIComponent(alert.token)}`).then(
      (r) => setHits(r.hits),
      (e) => setError(msg(e)),
    );
  }, [alert.token]);
  useEffect(load, [load]);
  return (
    <div className="space-y-1.5 rounded-lg border border-neutral-100 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setOpen(!open)} className="text-left">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-400">
            {alert.kind === "topic" ? "topic" : onOpenBox ? "project box" : "idea"}
          </p>
          <p className="text-[12.5px] font-medium text-neutral-800">{alert.label.slice(0, 140)}</p>
          <p className="text-[11.5px] text-neutral-500">
            {error ? error : hits === null ? "checking…" : `${hits.length} matching paper${hits.length === 1 ? "" : "s"}`}
            {hits?.length ? (open ? " · hide" : " · show") : ""}
          </p>
        </button>
        <button onClick={onStop} title="Stop this alert" className="shrink-0 text-[11px] text-neutral-400 hover:text-rose-600">
          stop
        </button>
      </div>
      <div className="flex gap-3 text-[11.5px]">
        {alert.node && nav && (
          <button onClick={() => nav.openTopic(alert.node!)} className="text-neutral-900 hover:underline">
            open topic
          </button>
        )}
        {onOpenBox && (
          <button onClick={onOpenBox} className="text-neutral-900 hover:underline">
            open box
          </button>
        )}
      </div>
      {open && hits?.slice(0, 10).map((p) => <PaperRow key={p.id} paper={p} />)}
    </div>
  );
}

// ── paper details ────────────────────────────────────────────────────────────

interface PaperDetail extends FieldPaper {
  path: { id: string; label: string }[];
}

export function PaperPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const nav = useFieldNav();
  const { state } = useStore();
  const box = state.nodes.find((n) => n.id === state.selectedId);
  const [p, setP] = useState<PaperDetail | null>(null);
  const [lin, setLin] = useState<{ builds_on: FieldPaper[]; built_on_by: FieldPaper[]; refs_total?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getJSON<PaperDetail>(`/api/field/paper?id=${encodeURIComponent(id)}`).then(
      (x) => live && setP(x),
      (e) => live && setError(msg(e)),
    );
    getJSON<{ builds_on: FieldPaper[]; built_on_by: FieldPaper[]; refs_total?: number }>(
      `/api/field/lineage?paper=${encodeURIComponent(id)}`,
    ).then(
      (x) => live && setLin(x),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <Panel title="Paper" icon={<GitFork className="size-3.5" />} onClose={onClose}>
      {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
      {!p && !error && (
        <p className="flex items-center gap-1.5 text-[12px] text-neutral-500">
          <Loader2 className="size-3 animate-spin" /> Loading…
        </p>
      )}
      {p && (
        <>
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-1 text-[11.5px] text-neutral-400">
              {p.path.slice(1).map((x, i) => (
                <span key={x.id} className="flex items-center gap-1">
                  {i > 0 && "›"}
                  <button onClick={() => nav?.openTopic(x.id)} className="hover:text-neutral-700">
                    {x.label}
                  </button>
                </span>
              ))}
            </p>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="block text-[15px] font-semibold leading-snug text-neutral-900 hover:text-neutral-900">
              {p.title}
            </a>
            <p className="text-[12px] text-neutral-500">
              {(p.authors || []).join(", ")} · {new Date(p.announced * 1000).getFullYear()}
              {p.source === "foundation" ? " · published paper" : " · preprint"}
            </p>
            {p.abstract && <p className="text-[12.5px] leading-relaxed text-neutral-700">{p.abstract}</p>}
            <PaperRow paper={p} node={box} />
            <button
              onClick={() => nav?.openLineage("paper", p.id)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-neutral-900 hover:underline"
            >
              <GitFork className="size-3" /> Trace its lineage on the map
            </button>
          </div>
          {lin && (
            <>
              <section className="space-y-1.5">
                <H3>Builds on ({lin.builds_on.length}{lin.refs_total ? ` of ${lin.refs_total} references on the map` : ""})</H3>
                {lin.builds_on.slice(0, 12).map((x) => (
                  <PaperRow key={x.id} paper={x} node={box} />
                ))}
              </section>
              <section className="space-y-1.5">
                <H3>Built on by ({lin.built_on_by.length})</H3>
                {lin.built_on_by.length === 0 && (
                  <p className="text-[12px] text-neutral-500">Nothing on the map cites it yet: new, overlooked, or a hidden gem.</p>
                )}
                {lin.built_on_by.slice(0, 12).map((x) => (
                  <PaperRow key={x.id} paper={x} node={box} />
                ))}
              </section>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

// ── who's working on what (signals on a topic) ───────────────────────────────

const SIGNALS = [
  { kind: "claim", label: "I'm working on this", icon: Hand, cls: "border-neutral-300 text-neutral-900 hover:bg-neutral-100" },
  { kind: "promising", label: "Promising", icon: Sparkles, cls: "border-neutral-300 text-neutral-900 hover:bg-neutral-100" },
  { kind: "dead_end", label: "Dead end", icon: Ban, cls: "border-rose-200 text-rose-700 hover:bg-rose-50" },
  { kind: "note", label: "Note", icon: NotebookPen, cls: "border-neutral-200 text-neutral-600 hover:bg-neutral-50" },
] as const;

export interface SignalLog {
  who: string;
  actor: string;
  kind: string;
  text?: string;
  created: number;
}

export function SignalsSection({
  node,
  counts,
  log,
  privateClaims,
  onSaved,
}: {
  node: string;
  counts: Record<string, number>;
  log: SignalLog[];
  privateClaims: number;
  onSaved: () => void;
}) {
  const { state } = useStore();
  const [kind, setKind] = useState<string | null>(null);
  const [who, setWho] = useState(() => {
    try {
      return localStorage.getItem("rt_who") || "";
    } catch {
      return "";
    }
  });
  const [text, setText] = useState("");
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) return;
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
        body: JSON.stringify({ node, kind, who: who || "anonymous", text, visibility: priv ? "private" : "public" }),
      });
      setKind(null);
      setText("");
      onSaved();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <H3>Who&apos;s on this topic</H3>
      <p className="flex flex-wrap gap-x-3 text-[12px] text-neutral-600">
        <span>
          <b>{counts.claim ?? 0}</b> working on it{privateClaims ? ` (${privateClaims} private)` : ""}
        </span>
        <span>
          <b>{counts.promising ?? 0}</b> promising
        </span>
        <span>
          <b>{counts.dead_end ?? 0}</b> dead end
        </span>
        <span>
          <b>{counts.done ?? 0}</b> done
        </span>
      </p>
      <div className="flex flex-wrap gap-1">
        {SIGNALS.map((s) => (
          <button
            key={s.kind}
            onClick={() => {
              setKind(kind === s.kind ? null : s.kind);
              if (s.kind === "claim" && !text) setText(`Our project: ${state.title}`);
            }}
            className={`flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[11.5px] font-medium ${s.cls} ${
              kind === s.kind ? "ring-2 ring-neutral-900/10" : ""
            }`}
          >
            <s.icon className="size-3" /> {s.label}
          </button>
        ))}
      </div>
      {kind && (
        <form onSubmit={submit} className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
          <input
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="Your name or lab"
            maxLength={60}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12.5px] focus:border-neutral-500 focus:outline-none"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={kind === "dead_end" ? "What failed? This is what saves the next lab weeks." : "What are you trying? (optional)"}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12.5px] focus:border-neutral-500 focus:outline-none"
          />
          {kind === "claim" && (
            <label className="flex items-center gap-1.5 text-[11.5px] text-neutral-600">
              <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Keep my claim private
              (counted, but my name isn&apos;t shown)
            </label>
          )}
          <div className="flex gap-1.5">
            <button disabled={busy} className="rounded-md bg-neutral-900 px-3 py-1 text-[12px] font-medium text-white disabled:opacity-50">
              {busy ? "Saving…" : "Tell the field"}
            </button>
            <button type="button" onClick={() => setKind(null)} className="rounded-md px-2 py-1 text-[12px] text-neutral-500">
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-neutral-400">Everyone using this field map sees public signals.</p>
          {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
        </form>
      )}
      {log.length > 0 && (
        <div className="space-y-1 border-l-2 border-neutral-100 pl-2.5">
          {log.map((x, i) => (
            <p key={i} className="text-[11.5px] leading-snug text-neutral-600">
              <b>{x.who}</b>
              {x.actor === "agent" ? " (agent)" : ""} · {x.kind.replace("_", " ")} · {ago(x.created)}
              {x.text ? ` — ${x.text}` : ""}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
