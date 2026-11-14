"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronRight, Flame, Loader2, Network, Search, Users, X } from "lucide-react";
import { useStore } from "@/lib/store";
import type { TreeNode } from "@/lib/types";
import { PaperRow, type FieldPaper } from "./FieldPanel";
import { useUI } from "./uiContext";

// The field map, inside HypoTree: the whole field (from Research Tree) as a tree of curated
// branches and grown topics, with the team's own ideas placed on it. Same canvas as the
// project tree, laid out left to right so dozens of topics stay readable.

interface FieldItem {
  id: string;
  label: string;
  depth: number;
  branch?: string;
  keywords?: string[];
  count: number;
  n7: number;
  momentum: number;
  children?: FieldItem[];
}

const PALETTE = ["#4f46e5", "#0d9488", "#d97706", "#db2777", "#7c3aed", "#0284c7", "#16a34a", "#ea580c", "#9333ea", "#475569"];
const COL = 290;
const ROW = 66;
const CARD_W = 236;

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

type FieldFlowNode = Node<
  {
    item: FieldItem;
    color: string;
    team: TreeNode[];
    open: boolean;
    hasKids: boolean;
    onToggle: (id: string) => void;
  },
  "field"
>;

function FieldNode({ data, selected }: NodeProps<FieldFlowNode>) {
  const { item, color, team, open, hasKids, onToggle } = data;
  const hot = item.depth > 1 && item.momentum >= 1.5;
  return (
    <div
      style={{ width: item.depth === 0 ? 200 : CARD_W, borderLeftColor: color }}
      className={`relative break-words rounded-lg border border-l-4 bg-white px-3 py-2 shadow-sm transition ${
        selected ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 hover:border-slate-400"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <p className={`leading-snug text-slate-900 ${item.depth <= 1 ? "text-[13px] font-semibold" : "text-[12px] font-medium"}`}>
        {item.label}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
        {item.count} papers{item.depth > 0 ? ` · +${item.n7} this week` : ""}
        {hot && (
          <span className="flex items-center gap-0.5 font-semibold text-orange-600" title="Growing faster than the field">
            <Flame className="size-3" /> {item.momentum}×
          </span>
        )}
      </p>
      {team.length > 0 && (
        <span
          title={team.map((t) => `• ${t.title}`).join("\n")}
          className="absolute -top-2 -right-2 flex items-center gap-0.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow"
        >
          <Users className="size-2.5" /> {team.length}
        </span>
      )}
      {hasKids && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item.id);
          }}
          className="nodrag absolute -right-3 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-900"
          title={open ? "Collapse" : "Expand"}
        >
          <ChevronRight className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

const nodeTypes = { field: FieldNode };

export function FieldMapView() {
  return (
    <ReactFlowProvider>
      <FieldMap />
    </ReactFlowProvider>
  );
}

function FieldMap() {
  const { state, dispatch } = useStore();
  const { fieldFocus } = useUI();
  const { setCenter, fitView } = useReactFlow();
  const [root, setRoot] = useState<FieldItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set(["root"]));
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState(0);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ hint: string; level: string } | null>(null);

  // Load the map; if opened from a box ("Show on the field map"), open the path to its topic.
  useEffect(() => {
    getJSON<FieldItem>("/api/field/tree").then(
      (r) => {
        setRoot(r);
        if (!fieldFocus) return;
        const parents = new Map<string, string>();
        const walk = (n: FieldItem) => n.children?.forEach((c) => (parents.set(c.id, n.id), walk(c)));
        walk(r);
        const path = new Set(["root"]);
        for (let cur = parents.get(fieldFocus); cur; cur = parents.get(cur)) path.add(cur);
        setOpen(path);
        setSelected(fieldFocus);
      },
      (e) => setError(e.message),
    );
  }, [fieldFocus]);

  // parent links and branch colours
  const { parentOf, colorOf } = useMemo(() => {
    const parentOf = new Map<string, string>();
    const colorOf = new Map<string, string>();
    root?.children?.forEach((b, i) => colorOf.set(b.id, PALETTE[i % PALETTE.length]));
    const walk = (n: FieldItem) => n.children?.forEach((c) => (parentOf.set(c.id, n.id), walk(c)));
    if (root) walk(root);
    return { parentOf, colorOf };
  }, [root]);

  // Place the team's ideas on the map (once per title; remembered on each box).
  useEffect(() => {
    const todo = state.nodes.filter(
      (n) => (n.kind === "root" || n.kind === "hypothesis") && !n.folded && n.fieldTopicFor !== n.title,
    );
    if (!root || todo.length === 0) return;
    let live = true;
    (async () => {
      for (const n of todo) {
        if (!live) return;
        setPlacing(todo.length - todo.indexOf(n));
        try {
          const r = await getJSON<{ node: string }>(`/api/field/locate?q=${encodeURIComponent(n.title)}`);
          dispatch({ type: "updateNode", id: n.id, patch: { fieldTopic: r.node, fieldTopicFor: n.title } });
        } catch {
          /* map unreachable: leave unplaced */
        }
      }
      if (live) setPlacing(0);
    })();
    return () => {
      live = false;
    };
  }, [root, state.nodes, dispatch]);

  // team ideas per field node (counted on the topic and every ancestor)
  const teamAt = useMemo(() => {
    const m = new Map<string, TreeNode[]>();
    for (const n of state.nodes) {
      if (!n.fieldTopic || n.folded) continue;
      let cur: string | undefined = n.fieldTopic;
      while (cur) {
        m.set(cur, [...(m.get(cur) ?? []), n]);
        cur = parentOf.get(cur);
      }
    }
    return m;
  }, [state.nodes, parentOf]);

  const reveal = useCallback(
    (id: string) => {
      setOpen((prev) => {
        const next = new Set(prev);
        for (let cur = parentOf.get(id); cur; cur = parentOf.get(cur)) next.add(cur);
        return next;
      });
      setSelected(id);
    },
    [parentOf],
  );

  const toggle = useCallback(
    (id: string) =>
      setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const { nodes, edges } = useMemo(() => {
    const nodes: FieldFlowNode[] = [];
    const edges: Edge[] = [];
    if (!root) return { nodes, edges };
    let nextY = 0;
    const place = (item: FieldItem, depth: number): number => {
      const kids = open.has(item.id) ? item.children ?? [] : [];
      let y: number;
      if (!kids.length) {
        y = nextY;
        nextY += ROW;
      } else {
        const ys = kids.map((k) => place(k, depth + 1));
        y = (ys[0] + ys[ys.length - 1]) / 2;
      }
      const color = item.depth === 0 ? "#0f172a" : colorOf.get(item.branch ?? item.id) ?? "#64748b";
      nodes.push({
        id: item.id,
        type: "field",
        position: { x: depth * COL, y },
        selected: item.id === selected,
        draggable: false,
        data: {
          item,
          color,
          team: teamAt.get(item.id) ?? [],
          open: open.has(item.id),
          hasKids: !!item.children?.length,
          onToggle: toggle,
        },
      });
      for (const k of kids)
        edges.push({
          id: `${item.id}-${k.id}`,
          source: item.id,
          target: k.id,
          type: "smoothstep",
          selectable: false,
          style: { stroke: colorOf.get(k.branch ?? k.id) ?? "#94a3b8", strokeOpacity: 0.45, strokeWidth: 1.6 },
        });
      return y;
    };
    place(root, 0);
    return { nodes, edges };
  }, [root, open, selected, teamAt, colorOf, toggle]);

  // keep the selected topic in view; otherwise show everything
  const target = nodes.find((n) => n.id === selected);
  const tx = target?.position.x;
  const ty = target?.position.y;
  const shape = nodes.length;
  useEffect(() => {
    const t = setTimeout(() => {
      if (tx !== undefined && ty !== undefined) setCenter(tx + CARD_W, ty + 20, { zoom: 0.9, duration: 450 });
      else fitView({ padding: 0.12, duration: 300, maxZoom: 1 });
    }, 250); // after React Flow has measured the cards
    return () => clearTimeout(t);
  }, [tx, ty, shape, setCenter, fitView]);

  const locate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await getJSON<{ node: string; novelty_hint: string; novelty_level: string }>(
        `/api/field/locate?q=${encodeURIComponent(query.trim())}`,
      );
      setFound({ hint: r.novelty_hint, level: r.novelty_level });
      reveal(r.node);
    } catch (err) {
      setFound({ hint: err instanceof Error ? err.message : String(err), level: "error" });
    } finally {
      setSearching(false);
    }
  };

  if (error)
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-800">{error}</div>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1 bg-[#fafbfc]">
        {!root ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Loading the field map…
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => {
              setSelected(n.id);
              if (!open.has(n.id) && (n.data as FieldFlowNode["data"]).hasKids) toggle(n.id);
            }}
            onPaneClick={() => setSelected(null)}
            nodesConnectable={false}
            minZoom={0.15}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d4d8e0" />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>
        )}
        <form
          onSubmit={locate}
          className="absolute left-4 top-4 z-10 flex w-[min(520px,calc(100%-2rem))] items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-sm backdrop-blur"
        >
          <Search className="ml-1.5 size-4 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find any idea on the field map…"
            className="min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
          />
          <button className="rounded-lg bg-slate-900 px-3 py-1 text-[12.5px] font-medium text-white hover:bg-slate-800">
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : "Locate"}
          </button>
        </form>
        {found && (
          <div className="absolute left-4 top-16 z-10 flex max-w-[520px] items-start gap-2 rounded-xl border border-slate-200 bg-white/95 p-2.5 text-[12.5px] text-slate-700 shadow-sm">
            <span>{found.hint}</span>
            <button onClick={() => setFound(null)} className="text-slate-400 hover:text-slate-700">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-4 left-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[11.5px] text-slate-600 shadow-sm">
          <span className="flex items-center gap-1">
            <span className="flex size-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] font-bold text-white">2</span>
            your project&apos;s ideas here
          </span>
          <span className="flex items-center gap-1 text-orange-600">
            <Flame className="size-3" /> growing faster than the field
          </span>
          {placing > 0 && (
            <span className="flex items-center gap-1 text-slate-500">
              <Loader2 className="size-3 animate-spin" /> placing your ideas ({placing} left)
            </span>
          )}
        </div>
      </div>
      {selected && (
        <TopicPanel
          key={selected}
          id={selected}
          team={teamAt.get(selected) ?? []}
          onFocus={reveal}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── topic panel ──────────────────────────────────────────────────────────────

interface TopicDetail {
  id: string;
  label: string;
  path: { id: string; label: string }[];
  keywords: string[];
  branch_desc: string;
  depth: number;
  count: number;
  n7: number;
  momentum: number;
  papers: FieldPaper[];
  near: { id: string; label: string; branch: string; sim: number }[];
  roots: { id: string; title: string; year: number; url?: string; built_on?: number }[];
}

function TopicPanel({
  id,
  team,
  onFocus,
  onClose,
}: {
  id: string;
  team: TreeNode[];
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const { setView } = useUI();
  const [d, setD] = useState<TopicDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getJSON<TopicDetail>(`/api/field/topic?id=${encodeURIComponent(id)}`).then(
      (x) => live && setD(x),
      (e) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const box = state.nodes.find((n) => n.id === state.selectedId);

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
          <Network className="size-3.5" /> Field map
        </span>
        <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
        {!d && !error && (
          <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
            <Loader2 className="size-3 animate-spin" /> Loading…
          </p>
        )}
        {d && (
          <>
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-1 text-[11.5px] text-slate-400">
                {d.path.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    {i > 0 && "›"}
                    <button onClick={() => p.id !== "root" && onFocus(p.id)} className="hover:text-slate-700">
                      {p.label}
                    </button>
                  </span>
                ))}
              </p>
              <h2 className="text-[17px] font-semibold leading-snug text-slate-900">{d.label}</h2>
              {d.depth === 1 && <p className="text-[12.5px] text-slate-500">{d.branch_desc}</p>}
              {d.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {d.keywords.map((k) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  [d.count, "papers"],
                  [`+${d.n7}`, "this week"],
                  [`${d.momentum}×`, "pace vs field"],
                ].map(([v, l]) => (
                  <div key={l as string} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                    <p className="text-[15px] font-semibold tabular-nums text-slate-900">{v}</p>
                    <p className="text-[10.5px] text-slate-500">{l}</p>
                  </div>
                ))}
              </div>
            </div>

            {team.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">Your project here</h3>
                {team.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      dispatch({ type: "select", id: n.id });
                      setView("project");
                    }}
                    className="block w-full rounded-lg border border-indigo-100 bg-indigo-50/60 p-2 text-left text-[12.5px] text-indigo-900 hover:border-indigo-300"
                  >
                    {n.title}
                  </button>
                ))}
              </section>
            )}

            <section className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Newest papers</h3>
              <p className="text-[11.5px] text-slate-500">
                {box ? (
                  <>
                    <b>+ Evidence</b> adds to “{box.title.slice(0, 70)}”.
                  </>
                ) : (
                  "Select a box in the project tree to add papers to its evidence."
                )}
              </p>
              {d.papers.slice(0, 12).map((p) => (
                <PaperRow key={p.id} paper={p} node={box} />
              ))}
            </section>

            {d.near.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Where this touches other branches
                </h3>
                {d.near.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onFocus(n.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-50"
                  >
                    <span>{n.label}</span>
                    <span className="text-[11px] text-slate-400">{n.sim.toFixed(2)}</span>
                  </button>
                ))}
              </section>
            )}

            {d.roots.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Most built-on here</h3>
                {d.roots.map((r) => (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md px-2 py-1.5 text-[12.5px] text-slate-700 hover:bg-slate-50 hover:text-emerald-700"
                  >
                    {r.title} <span className="text-slate-400">({r.year}{r.built_on ? `, built on by ${r.built_on}` : ""})</span>
                  </a>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
