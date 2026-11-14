"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  Panel as FlowPanel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Ban,
  BellRing,
  ChevronRight,
  CircleDot,
  Minus,
  Plus,
  Flame,
  Crosshair,
  GitFork,
  Hand,
  Lightbulb,
  LayoutList,
  Loader2,
  Network,
  Search,
  Users,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { TreeNode } from "@/lib/types";
import { FieldLineage, type LineageTarget } from "./FieldLineage";
import {
  ago,
  AlertsPanel,
  ComboPanel,
  CreateAlert,
  getJSON,
  H3,
  IdeaPanel,
  OverviewPanel,
  Panel,
  PaperPanel,
  SignalsSection,
  Sparkline,
  type FieldItem,
  type FieldStatus,
  type SignalLog,
} from "./FieldMapPanels";
import { PaperRow, type FieldPaper } from "./FieldPanel";
import { FieldNavContext, loadAlerts, saveAlerts, type FieldNav, type SavedAlert } from "./fieldNav";
import { useUI } from "./uiContext";

// The field map, inside Branchly: the whole field (from Research Tree) as a tree of curated
// branches and grown topics, with the team's own ideas placed on it. Same canvas as the
// project tree, laid out left to right so dozens of topics stay readable.

// branches are told apart by shade, in keeping with the rest of Branchly
const PALETTE = ["#404040", "#737373", "#525252", "#8a8a8a", "#262626", "#636363", "#9a9a9a", "#4a4a4a", "#7d7d7d", "#5c5c5c"];
const COL = 252;
const ROW = 100;
const CARD_W = 210;

type FieldFlowNode = Node<
  {
    item: FieldItem;
    color: string;
    team: TreeNode[];
    open: boolean;
    hasKids: boolean;
    pulse: boolean;
    onToggle: (id: string) => void;
  },
  "field"
>;

function FieldNode({ data, selected }: NodeProps<FieldFlowNode>) {
  const { item, team, open, hasKids, pulse, onToggle } = data;
  const sig = item.signals;
  const hot = item.depth > 1 && item.momentum >= 1.5;
  const isRoot = item.depth === 0;
  const isBranch = item.depth === 1;
  return (
    <div
      style={{ width: isRoot ? 188 : CARD_W }}
      className={`group relative break-words rounded-[10px] border px-3 py-2.5 transition ${
        isRoot ? "bg-neutral-200/80 px-4 py-3.5" : isBranch ? "bg-neutral-50" : "bg-white"
      } ${selected ? "border-neutral-900 shadow-[0_0_0_1px_#171717]" : "border-neutral-300 hover:border-neutral-500"} ${
        pulse ? "animate-pulse shadow-[0_0_0_4px_rgba(23,23,23,0.15)]" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-neutral-500">
        {isRoot ? "Field" : isBranch ? (
          <>
            <Network className="size-3.5" /> Branch
          </>
        ) : (
          <>
            <CircleDot className="size-3.5" /> Topic
          </>
        )}
        {hot && (
          <span className="ml-auto flex items-center gap-0.5 font-semibold text-neutral-900" title="Growing faster than the field">
            <Flame className="size-3" /> {item.momentum}×
          </span>
        )}
      </p>
      <p
        className={`leading-snug text-neutral-900 ${
          isRoot ? "text-[14px] font-semibold" : isBranch ? "text-[13px] font-semibold" : "text-[12.5px]"
        }`}
      >
        {item.label}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-neutral-500">
        <span>
          <b className="font-semibold text-neutral-800">{item.count.toLocaleString()}</b> papers
        </span>
        {!isRoot && <span>· +{item.n7} this week</span>}
        {!!sig?.claim && (
          <span className="flex items-center gap-0.5 text-neutral-700" title={`${sig.claim} working on this`}>
            · <Hand className="size-3" /> {sig.claim}
          </span>
        )}
        {!!sig?.dead_end && (
          <span className="flex items-center gap-0.5 text-rose-700" title={`${sig.dead_end} marked a dead end`}>
            · <Ban className="size-3" /> {sig.dead_end}
          </span>
        )}
      </p>
      {team.length > 0 && (
        <span
          title={team.map((t) => `• ${t.title}`).join("\n")}
          className="absolute -right-2 -top-2 flex items-center gap-0.5 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
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
          className="nodrag absolute -right-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 shadow-sm hover:text-neutral-900"
          title={open ? "Collapse" : "Expand"}
        >
          <ChevronRight className={`size-3 transition ${open ? "rotate-180" : ""}`} />
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
  const { setCenter, fitView, zoomIn, zoomOut } = useReactFlow();
  const [root, setRoot] = useState<FieldItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set(["root"]));
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showHomeless, setShowHomeless] = useState(false);
  const { setView } = useUI();
  const homeless = state.nodes.filter((n) => n.fieldNoHome && !n.folded);
  // what the right-hand panel shows, and which canvas: the topic tree or citation lineage
  const [side, setSide] = useState<Side | null>({ kind: "overview" });
  const [mode, setMode] = useState<"idea" | "parts">("idea");
  const [located, setLocated] = useState<{ q: string; r: LocateHit } | null>(null);
  const [canvas, setCanvas] = useState<"topics" | "lineage">("topics");
  const [lineageOf, setLineageOf] = useState<LineageTarget | null>(null);
  // live: newest arrivals, poll status, topics that just received papers
  const [feed, setFeed] = useState<FieldPaper[]>([]);
  const [status, setStatus] = useState<FieldStatus | null>(null);
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [, setTick] = useState(0);
  const [alerts, setAlerts] = useState<SavedAlert[]>(() => (typeof window === "undefined" ? [] : loadAlerts()));
  const addAlert = useCallback((a: SavedAlert) => {
    setAlerts((prev) => {
      const next = [a, ...prev.filter((x) => x.token !== a.token)];
      saveAlerts(next);
      return next;
    });
  }, []);
  const stopAlert = useCallback((token: string) => {
    setAlerts((prev) => {
      const next = prev.filter((x) => x.token !== token);
      saveAlerts(next);
      return next;
    });
  }, []);

  const reloadTree = useCallback(
    () =>
      getJSON<FieldItem>("/api/field/tree").then((r) => {
        setRoot(r);
        if (r.status) setStatus(r.status);
      }),
    [],
  );

  // Live updates from the field: new preprints, signals, re-grown topics.
  useEffect(() => {
    const es = new EventSource("/api/field/events");
    let clear: ReturnType<typeof setTimeout> | undefined;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      let ev: { type: string; status?: FieldStatus; papers?: FieldPaper[] };
      try {
        ev = JSON.parse(m.data);
      } catch {
        return;
      }
      if (ev.status) setStatus(ev.status);
      if (ev.type === "papers" && ev.papers?.length) {
        const papers = ev.papers;
        setFeed((prev) => [...papers, ...prev].slice(0, 30));
        setPulse(new Set(papers.flatMap((p) => [p.node ?? "", p.branch ?? ""])));
        setBanner(`${papers.length} new paper${papers.length > 1 ? "s" : ""} just landed on the map`);
        clearTimeout(clear);
        clear = setTimeout(() => (setPulse(new Set()), setBanner(null)), 12_000);
        reloadTree().catch(() => {});
      } else if (ev.type === "signal" || ev.type === "rebuilt" || ev.type === "refs") {
        reloadTree().catch(() => {});
      } else if (ev.type === "alerts") {
        setBanner("New papers matched one of your alerts");
      }
    };
    const tick = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      es.close();
      clearTimeout(clear);
      clearInterval(tick);
    };
  }, [reloadTree]);

  // Load the map; if opened from a box ("Show on the field map"), open the path to its topic.
  useEffect(() => {
    getJSON<FieldItem>("/api/field/tree").then(
      (r) => {
        setRoot(r);
        if (r.status) setStatus(r.status);
        if (!fieldFocus) return;
        const parents = new Map<string, string>();
        const walk = (n: FieldItem) => n.children?.forEach((c) => (parents.set(c.id, n.id), walk(c)));
        walk(r);
        const path = new Set(["root"]);
        for (let cur = parents.get(fieldFocus); cur; cur = parents.get(cur)) path.add(cur);
        setOpen(path);
        setSelected(fieldFocus);
        setSide({ kind: "topic", id: fieldFocus });
      },
      (e) => setError(e.message),
    );
  }, [fieldFocus]);

  // parent links and branch colours
  const { parentOf, colorMap } = useMemo(() => {
    const parentOf = new Map<string, string>();
    const colorOf = new Map<string, string>();
    root?.children?.forEach((b, i) => colorOf.set(b.id, PALETTE[i % PALETTE.length]));
    const walk = (n: FieldItem) => n.children?.forEach((c) => (parentOf.set(c.id, n.id), walk(c)));
    if (root) walk(root);
    return { parentOf, colorMap: colorOf };
  }, [root]);
  const colorOf = useMemo(() => ({ get: (id: string) => colorMap.get(id) }), [colorMap]);
  const colorFn = useCallback((branch: string) => colorMap.get(branch) ?? "#64748b", [colorMap]);

  // team ideas per field node (counted on the topic and every ancestor)
  const teamAt = useMemo(() => {
    const m = new Map<string, TreeNode[]>();
    for (const n of state.nodes) {
      if (!n.fieldTopic || n.folded || n.fieldNoHome) continue;
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
    // the selected topic and everything above it
    const onPath = new Set<string>();
    for (let cur: string | undefined = selected ?? undefined; cur; cur = parentOf.get(cur)) onPath.add(cur);
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
          pulse: pulse.has(item.id),
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
          // gray lines; the path down to the selected topic is dark, as in the hypothesis tree
          style: onPath.has(k.id) ? { stroke: "#262626", strokeWidth: 2.4 } : { stroke: "#b8b8b8", strokeWidth: 1.6 },
        });
      return y;
    };
    place(root, 0);
    return { nodes, edges };
  }, [root, open, selected, teamAt, colorOf, toggle, pulse, parentOf]);

  const nav: FieldNav = useMemo(
    () => ({
      openTopic: (id: string) => {
        setCanvas("topics");
        reveal(id);
        setSide({ kind: "topic", id });
      },
      openPaper: (id: string) => {
        setSide({ kind: "paper", id });
        setLineageOf({ kind: "paper", id });
        setCanvas("lineage");
      },
      openLineage: (kind: "node" | "paper", id: string) => {
        setLineageOf({ kind, id });
        setCanvas("lineage");
      },
    }),
    [reveal, setSide, setCanvas, setLineageOf],
  );

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
  }, [tx, ty, shape, setCenter, fitView, canvas]);

  const locate = async (e: React.FormEvent) => {
    e.preventDefault();
    await runLocate(query.trim());
  };
  const runLocate = async (q: string) => {
    if (!q) return;
    setQuery(q);
    setMode("idea");
    setSearching(true);
    setLocated(null);
    setSide({ kind: "idea", q });
    try {
      const r = await getJSON<LocateHit>(`/api/field/locate?q=${encodeURIComponent(q)}`);
      setLocated({ q, r });
      setCanvas("topics");
      reveal(r.node);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : String(err));
      setSide({ kind: "overview" });
    } finally {
      setSearching(false);
    }
  };

  const lineageTarget: LineageTarget | null =
    lineageOf ?? (selected ? { kind: "node", id: selected } : root?.children?.[0] ? { kind: "node", id: root.children[0].id } : null);

  if (error)
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-800">{error}</div>
      </div>
    );

  return (
    <FieldNavContext.Provider value={nav}>
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1 bg-[#f6f6f4]">
        {canvas === "lineage" && lineageTarget ? (
          <FieldLineage
            target={lineageTarget}
            colorOf={colorFn}
            onOpenPaper={(id) => setSide({ kind: "paper", id })}
            focusPaper={side?.kind === "paper" ? side.id : null}
          />
        ) : !root ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-neutral-500">
            <Loader2 className="size-4 animate-spin" /> Loading the field map…
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => {
              setSelected(n.id);
              setSide({ kind: "topic", id: n.id });
              if (!open.has(n.id) && (n.data as FieldFlowNode["data"]).hasKids) toggle(n.id);
            }}
            onPaneClick={() => {
              setSelected(null);
              setSide({ kind: "overview" });
            }}
            nodesConnectable={false}
            minZoom={0.15}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d9d9d6" />
            <FlowPanel position="bottom-left" className="!m-5 flex flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm">
              <button onClick={() => zoomIn({ duration: 200 })} title="Zoom in" className="flex size-8 items-center justify-center text-neutral-700 hover:bg-neutral-100">
                <Plus className="size-4" />
              </button>
              <span className="h-px bg-neutral-200" />
              <button onClick={() => zoomOut({ duration: 200 })} title="Zoom out" className="flex size-8 items-center justify-center text-neutral-700 hover:bg-neutral-100">
                <Minus className="size-4" />
              </button>
            </FlowPanel>
          </ReactFlow>
        )}
        <div className="absolute left-5 right-5 top-5 z-10 flex flex-wrap items-start gap-2">
          <div className="flex w-[min(560px,100%)] items-center gap-1 rounded-xl border border-neutral-300 bg-white p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)] focus-within:border-neutral-900">
            <div className="flex shrink-0 rounded-lg bg-neutral-100 p-0.5 text-[12px] font-medium">
              {(
                [
                  ["idea", "Idea"],
                  ["parts", "Problem · method · setting"],
                ] as const
              ).map(([m, l]) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    if (m === "parts") setSide({ kind: "combo" });
                  }}
                  className={`rounded-md px-2 py-1 ${mode === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {mode === "idea" ? (
              <form onSubmit={locate} className="flex min-w-0 flex-1 items-center gap-1.5">
                <Search className="ml-1 size-4 shrink-0 text-neutral-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Describe an idea: where it sits, what's closest, what to read"
                  className="min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
                />
                <button className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-neutral-700">
                  {searching ? <Loader2 className="size-3.5 animate-spin" /> : "Locate"}
                </button>
              </form>
            ) : (
              <p className="min-w-0 flex-1 px-2 text-[12px] text-neutral-500">Fill in the parts in the panel on the right →</p>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex rounded-lg bg-neutral-100 p-0.5 text-[12.5px] font-medium">
              <button
                onClick={() => setCanvas("topics")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${canvas === "topics" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
              >
                <Network className="size-3.5" /> Topic tree
              </button>
              <button
                onClick={() => {
                  if (!lineageOf && selected) setLineageOf({ kind: "node", id: selected });
                  setCanvas("lineage");
                }}
                title="Citation lineage of the selected topic: who builds on whom"
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${canvas === "lineage" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"}`}
              >
                <GitFork className="size-3.5" /> Lineage
              </button>
            </div>
            <button
              onClick={() => setSide({ kind: "overview" })}
              title="Field overview: open frontiers, newest papers"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-[7px] text-[13px] font-medium text-neutral-800 transition hover:border-neutral-900"
            >
              <LayoutList className="size-3.5" /> Overview
            </button>
            <button
              onClick={() => setSide({ kind: "alerts" })}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-[7px] text-[13px] font-medium text-neutral-800 transition hover:border-neutral-900"
            >
              <BellRing className="size-3.5" /> Alerts
              {alerts.length + state.nodes.filter((n) => n.fieldWatch).length > 0 && (
                <span className="rounded-full bg-neutral-900 px-1.5 text-[10px] font-bold text-white">
                  {alerts.length + state.nodes.filter((n) => n.fieldWatch).length}
                </span>
              )}
            </button>
          </div>
        </div>
        <WorkingOn />
        {canvas === "lineage" && lineageOf && (
          <button
            onClick={() => setLineageOf(null)}
            className="absolute left-4 top-[6.25rem] z-10 rounded-lg border border-neutral-200 bg-white/95 px-2 py-1 text-[11.5px] text-neutral-600 shadow-sm hover:text-neutral-900"
          >
            ← lineage of the selected topic instead
          </button>
        )}
        {showHomeless && homeless.length > 0 && (
          <div className="absolute bottom-[4.25rem] left-[4.5rem] z-10 w-[min(420px,calc(100%-5rem))] space-y-1.5 rounded-xl border border-neutral-200 bg-white/95 p-3 text-[12.5px] shadow-sm">
            <p className="text-neutral-500">
              No topic on the map clearly matches these ideas. They may be new ground, or outside what
              the map covers. Click one to open it.
            </p>
            {homeless.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  dispatch({ type: "select", id: n.id });
                  setView("project");
                }}
                className="block w-full rounded-md border border-neutral-100 bg-neutral-50 p-1.5 text-left text-neutral-700 hover:border-neutral-300"
              >
                {n.title}
              </button>
            ))}
          </div>
        )}
        {banner && (
          <div className="absolute left-1/2 top-[6.25rem] z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-neutral-300 bg-neutral-100 px-3 py-2 text-[12.5px] font-medium text-neutral-900 shadow-sm">
            {banner}
            <button onClick={() => setBanner(null)} className="text-neutral-900/60 hover:text-neutral-900">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {canvas === "topics" && (
        <div className="pointer-events-none absolute bottom-5 left-[4.5rem] z-10 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-[11.5px] text-neutral-600 shadow-sm">
          <span className="flex items-center gap-1">
            <span className="flex size-4 items-center justify-center rounded-full bg-neutral-900 text-[9px] font-bold text-white">2</span>
            your project&apos;s ideas here
          </span>
          <span className="flex items-center gap-1 text-neutral-900">
            <Flame className="size-3" /> growing faster than the field
          </span>
          {homeless.length > 0 && (
            <button
              onClick={() => setShowHomeless(!showHomeless)}
              className="pointer-events-auto text-neutral-500 underline decoration-dotted hover:text-neutral-800"
            >
              {homeless.length} idea{homeless.length > 1 ? "s" : ""} with no clear home
            </button>
          )}
          <span className="flex items-center gap-1 text-neutral-900">
            <Hand className="size-3" /> someone is working on it
          </span>
        </div>
        )}
        {status && (
          <div
            className="pointer-events-none absolute bottom-5 right-5 z-10 flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white/90 px-3 py-1.5 text-[11.5px] text-neutral-600 shadow-sm"
            title={status.last_error ? `Last poll error: ${status.last_error}` : undefined}
          >
            <span className={`size-2 rounded-full ${connected && !status.last_error ? "animate-pulse bg-neutral-1000" : "bg-rose-500"}`} />
            <b>{status.papers?.toLocaleString()}</b> papers · checked {ago(status.last_poll)}
            {status.continuous ? " · new preprints every 20 min" : ""}
          </div>
        )}
      </div>
      {side?.kind === "overview" && root && (
        <OverviewPanel root={root} feed={feed} colorOf={colorFn} onClose={() => setSide(null)} />
      )}
      {side?.kind === "topic" && (
        <TopicPanel
          key={side.id}
          id={side.id}
          team={teamAt.get(side.id) ?? []}
          onFocus={nav.openTopic}
          onLineage={(id) => nav.openLineage("node", id)}
          onIdea={(q) => runLocate(q)}
          onAlert={addAlert}
          onSignal={() => reloadTree().catch(() => {})}
          onClose={() => {
            setSelected(null);
            setSide({ kind: "overview" });
          }}
        />
      )}
      {side?.kind === "idea" && (
        <IdeaPanel
          key={side.q}
          q={side.q}
          located={located?.q === side.q ? located.r : null}
          onAlert={addAlert}
          onClose={() => setSide({ kind: "overview" })}
        />
      )}
      {side?.kind === "combo" && (
        <ComboPanel
          examples={(status as FieldStatus & { aspect_examples?: Record<string, string> })?.aspect_examples}
          onClose={() => {
            setMode("idea");
            setSide({ kind: "overview" });
          }}
        />
      )}
      {side?.kind === "alerts" && (
        <AlertsPanel alerts={alerts} onStop={stopAlert} onClose={() => setSide({ kind: "overview" })} />
      )}
      {side?.kind === "paper" && <PaperPanel key={side.id} id={side.id} onClose={() => setSide({ kind: "overview" })} />}
    </div>
    </FieldNavContext.Provider>
  );
}

type Side =
  | { kind: "overview" }
  | { kind: "topic"; id: string }
  | { kind: "idea"; q: string }
  | { kind: "combo" }
  | { kind: "alerts" }
  | { kind: "paper"; id: string };

interface LocateHit {
  node: string;
  path: { id: string; label: string }[];
  novelty_level: "crowded" | "related" | "sparse";
  novelty_hint: string;
  placement_confidence: number;
  bridge?: { id: string; label: string } | null;
  nearest: FieldPaper[];
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
  weeks: number[];
  signals: Record<string, number>;
  signal_log: SignalLog[];
  private_claims: number;
  children: { id: string; label: string; count?: number }[];
  exemplars: FieldPaper[];
  bridges: { label: string; papers: number }[];
}

function TopicPanel({
  id,
  team,
  onFocus,
  onLineage,
  onIdea,
  onAlert,
  onSignal,
  onClose,
}: {
  id: string;
  team: TreeNode[];
  onFocus: (id: string) => void;
  onLineage: (id: string) => void;
  onIdea: (q: string) => void;
  onAlert: (a: SavedAlert) => void;
  onSignal: () => void;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const { setView } = useUI();
  const [d, setD] = useState<TopicDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    getJSON<TopicDetail>(`/api/field/topic?id=${encodeURIComponent(id)}`).then(
      (x) => live && setD(x),
      (e) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [id, version]);

  const box = state.nodes.find((n) => n.id === state.selectedId);

  return (
    <Panel title="Field map" icon={<Network className="size-3.5" />} onClose={onClose}>
        {error && <p className="rounded-md bg-rose-50 p-2 text-[12px] text-rose-700">{error}</p>}
        {!d && !error && (
          <p className="flex items-center gap-1.5 text-[12px] text-neutral-500">
            <Loader2 className="size-3 animate-spin" /> Loading…
          </p>
        )}
        {d && (
          <>
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-1 text-[11.5px] text-neutral-400">
                {d.path.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    {i > 0 && "›"}
                    <button onClick={() => p.id !== "root" && onFocus(p.id)} className="hover:text-neutral-700">
                      {p.label}
                    </button>
                  </span>
                ))}
              </p>
              <h2 className="text-[21px] font-semibold leading-[1.25] tracking-[-0.01em] text-neutral-950">{d.label}</h2>
              {d.depth === 1 && <p className="text-[12.5px] text-neutral-500">{d.branch_desc}</p>}
              {d.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {d.keywords.map((k) => (
                    <span key={k} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[
                  [d.count, "papers"],
                  [`+${d.n7}`, "this week"],
                  [`${d.momentum}×`, "pace vs field"],
                ].map(([v, l]) => (
                  <div key={l as string} className="rounded-lg border border-neutral-100 bg-neutral-50 px-2.5 py-2">
                    <p className="text-[15px] font-semibold tabular-nums text-neutral-900">{v}</p>
                    <p className="text-[10.5px] text-neutral-500">{l}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-2 py-2">
                  <Sparkline weeks={d.weeks ?? []} />
                  <p className="text-[10.5px] text-neutral-500">8 weeks</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  onClick={() => onLineage(d.id)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-1.5 text-[12.5px] font-semibold text-neutral-700 hover:border-neutral-400"
                >
                  <GitFork className="size-3.5" /> Citation lineage of this {d.depth === 1 ? "branch" : "topic"}
                </button>
                <CreateAlert spec={{ node: d.id }} label={d.path.slice(1).map((p) => p.label).join(" › ")} onCreated={onAlert} />
              </div>
            </div>

            <IdeaHere label={d.label} onIdea={onIdea} />

            <SignalsSection
              node={d.id}
              counts={d.signals ?? {}}
              log={d.signal_log ?? []}
              privateClaims={d.private_claims ?? 0}
              onSaved={() => {
                setVersion((v) => v + 1);
                onSignal();
              }}
            />

            {team.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-1000">Your project here</h3>
                {team.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      dispatch({ type: "select", id: n.id });
                      setView("project");
                    }}
                    className="block w-full rounded-lg border border-neutral-100 bg-neutral-100/60 p-2 text-left text-[12.5px] text-neutral-900 hover:border-neutral-300"
                  >
                    {n.title}
                  </button>
                ))}
              </section>
            )}

            {d.children?.length > 0 && (
              <section className="space-y-1">
                <H3>Sub-topics</H3>
                {d.children.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onFocus(c.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px] text-neutral-700 hover:bg-neutral-50"
                  >
                    <span>{c.label}</span>
                    <ChevronRight className="size-3.5 text-neutral-400" />
                  </button>
                ))}
              </section>
            )}

            <section className="space-y-1.5">
              <h3 className="text-[13px] font-medium text-neutral-500">Newest papers</h3>
              <p className="text-[11.5px] text-neutral-500">
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

            {d.exemplars?.length > 0 && (
              <section className="space-y-1.5">
                <H3>Most typical papers here</H3>
                {d.exemplars.slice(0, 5).map((p) => (
                  <PaperRow key={p.id} paper={p} node={box} />
                ))}
              </section>
            )}

            {d.near.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-[13px] font-medium text-neutral-500">
                  Where this touches other branches
                </h3>
                {d.near.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onFocus(n.id)}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px] text-neutral-700 hover:bg-neutral-50"
                  >
                    <span>{n.label}</span>
                    <span className="text-[11px] text-neutral-400">{n.sim.toFixed(2)}</span>
                  </button>
                ))}
                {d.bridges?.length > 0 && (
                  <p className="px-2 text-[11.5px] text-neutral-500">
                    {d.bridges.map((b) => `${b.papers} papers here also fit ${b.label}`).join(" · ")}
                  </p>
                )}
              </section>
            )}

            {d.roots.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-[13px] font-medium text-neutral-500">Most built-on here</h3>
                {d.roots.map((r) => (
                  <a
                    key={r.id}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md px-2 py-1.5 text-[12.5px] text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
                  >
                    {r.title} <span className="text-neutral-400">({r.year}{r.built_on ? `, built on by ${r.built_on}` : ""})</span>
                  </a>
                ))}
              </section>
            )}
          </>
        )}
    </Panel>
  );
}

/** Which project box "+ Evidence" adds papers to, so that is never a surprise. */
function WorkingOn() {
  const { state, dispatch } = useStore();
  const box = state.nodes.find((n) => n.id === state.selectedId);
  return (
    <div className="pointer-events-auto absolute left-4 top-[4.25rem] z-10 hidden max-w-[460px] items-center gap-1.5 rounded-lg border border-neutral-200 bg-white/95 px-2 py-1 text-[11.5px] text-neutral-600 shadow-sm md:flex">
      <Crosshair className="size-3.5 shrink-0 text-neutral-1000" />
      {box ? (
        <>
          <span className="truncate">
            Papers go to: <b className="text-neutral-800">{box.title}</b>
          </span>
          <button onClick={() => dispatch({ type: "select", id: null })} className="text-neutral-400 hover:text-neutral-800" title="Unselect">
            <X className="size-3" />
          </button>
        </>
      ) : (
        <span>No box selected: pick one in the project tree to collect papers into it</span>
      )}
    </div>
  );
}

/** Have an idea in this topic? Check it, then take it into Branchly. */
function IdeaHere({ label, onIdea }: { label: string; onIdea: (q: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onIdea(text.trim());
      }}
      className="space-y-1.5 rounded-xl border border-neutral-300 bg-neutral-100/50 p-3"
    >
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-900">
        <Lightbulb className="size-3.5" /> Have an idea here?
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={`A hypothesis in ${label}…`}
        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-[12.5px] focus:border-neutral-500 focus:outline-none"
      />
      <button
        disabled={!text.trim()}
        className="w-full rounded-lg bg-neutral-900 py-1.5 text-[12px] font-semibold text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        Check it against the field, then start a tree
      </button>
    </form>
  );
}
