"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Loader2 } from "lucide-react";

// Citation lineage on the field map: who builds on whom. Papers sit left to right by date, in
// one lane per topic; lanes from other branches (papers the lineage is intertwined with) are
// shown faded below. An edge runs from a paper back to the work it cites.

export interface LineagePaper {
  id: string;
  title: string;
  announced: number;
  branch: string;
  node: string;
  topic: string;
  lane: string;
  inside: boolean;
  built_on?: number;
  builds_on?: number;
  level?: number;
}

interface LineageData {
  label?: string;
  paper?: { id: string; title: string };
  path: { id: string; label: string }[];
  nodes: LineagePaper[];
  edges: { s: string; t: string; main: boolean }[];
  coverage?: { papers: number; with_references: number };
}

export type LineageTarget = { kind: "node" | "paper"; id: string };

const CARD_W = 178;
const CARD_H = 46;
const ROW_H = 52;
const COL_W = CARD_W + 12;
const MAX_ROWS = 5; // a year × topic cell grows sideways after this many rows
const LANE_GAP = 34;
const YEAR_GAP = 36;

type PaperNode = Node<{ p: LineagePaper; color: string; focus: boolean; onOpen: (id: string) => void }, "paper">;
type LaneNode = Node<{ label: string; inside: boolean; count: number; right?: boolean }, "lane">;
type TickNode = Node<{ label: string }, "tick">;

function PaperCard({ data }: NodeProps<PaperNode>) {
  const { p, color, focus, onOpen } = data;
  return (
    <button
      onClick={() => onOpen(p.id)}
      style={{ width: CARD_W, height: CARD_H, borderLeftColor: color }}
      title={p.title}
      className={`block overflow-hidden rounded-md border border-l-4 px-2 py-1 text-left shadow-sm transition hover:border-slate-500 ${
        p.inside ? "bg-white" : "border-dashed bg-slate-50 opacity-75"
      } ${focus ? "ring-2 ring-indigo-500" : "border-slate-200"}`}
    >
      <Handle type="source" position={Position.Left} className="!opacity-0" />
      <Handle type="target" position={Position.Right} className="!opacity-0" />
      <p className="line-clamp-2 text-[10.5px] font-medium leading-tight text-slate-800">{p.title}</p>
      <p className="text-[9.5px] text-slate-400">
        {new Date(p.announced * 1000).getFullYear()}
        {p.built_on ? ` · built on by ${p.built_on}` : ""}
      </p>
    </button>
  );
}

function LaneLabel({ data }: NodeProps<LaneNode>) {
  return (
    <div className={`w-[190px] ${data.right ? "text-left" : "text-right"} text-[11.5px] leading-tight ${data.inside ? "font-semibold text-slate-700" : "text-slate-400"}`}>
      {data.label}
      <span className="block text-[10px] font-normal text-slate-400">
        {data.count} paper{data.count > 1 ? "s" : ""}
        {data.inside ? "" : " · other topic"}
      </span>
    </div>
  );
}

function Tick({ data }: NodeProps<TickNode>) {
  return <div className="text-[11px] font-semibold text-slate-400">{data.label}</div>;
}

const nodeTypes = { paper: PaperCard, lane: LaneLabel, tick: Tick };

export function FieldLineage(props: {
  target: LineageTarget;
  colorOf: (branch: string) => string;
  onOpenPaper: (id: string) => void;
  focusPaper?: string | null;
}) {
  return (
    <ReactFlowProvider>
      <LineageGraph {...props} />
    </ReactFlowProvider>
  );
}

function LineageGraph({
  target,
  colorOf,
  onOpenPaper,
  focusPaper,
}: {
  target: LineageTarget;
  colorOf: (branch: string) => string;
  onOpenPaper: (id: string) => void;
  focusPaper?: string | null;
}) {
  const [data, setData] = useState<{ key: string; d: LineageData } | null>(null);
  const [error, setError] = useState<{ key: string; msg: string } | null>(null);
  const key = `${target.kind}:${target.id}`;
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/field/lineage?${target.kind}=${encodeURIComponent(target.id)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
        return body as LineageData;
      })
      .then(
        (d) => live && setData({ key, d }),
        (e) => live && setError({ key, msg: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      live = false;
    };
  }, [key, target.kind, target.id]);

  const d = data?.key === key ? data.d : null;
  const err = error?.key === key ? error.msg : null;
  const focus = focusPaper ?? (target.kind === "paper" ? target.id : null);

  const { nodes, edges, width } = useMemo(() => {
    const nodes: (PaperNode | LaneNode | TickNode)[] = [];
    const edges: Edge[] = [];
    if (!d || !d.nodes.length) return { nodes, edges, width: 0 };
    // Grid: one column block per year (older years with few papers stay narrow), one lane per
    // topic. Real time spacing would squeeze the recent burst of preprints into one column.
    const yearOf = (p: LineagePaper) => new Date(p.announced * 1000).getUTCFullYear();
    const lanes = new Map<string, LineagePaper[]>();
    for (const p of d.nodes) lanes.set(p.lane, [...(lanes.get(p.lane) ?? []), p]);
    const order = [...lanes.entries()].sort(
      ([, a], [, b]) => Number(b.some((p) => p.inside)) - Number(a.some((p) => p.inside)) || b.length - a.length,
    );
    const years = [...new Set(d.nodes.map(yearOf))].sort((a, b) => a - b);
    // columns each year needs = the most any lane needs in that year
    const colsOf = new Map<number, number>();
    for (const [, papers] of order)
      for (const yr of years) {
        const n = papers.filter((p) => yearOf(p) === yr).length;
        colsOf.set(yr, Math.max(colsOf.get(yr) ?? 1, Math.ceil(n / MAX_ROWS)));
      }
    const xOfYear = new Map<number, number>();
    let x = 0;
    for (const yr of years) {
      xOfYear.set(yr, x);
      x += colsOf.get(yr)! * COL_W + YEAR_GAP;
    }

    let y = 0;
    for (const [lane, papers] of order) {
      const inside = papers.some((p) => p.inside);
      let laneRows = 1;
      for (const yr of years) {
        const cell = papers.filter((p) => yearOf(p) === yr).sort((a, b) => a.announced - b.announced);
        const cols = colsOf.get(yr)!;
        const rows = Math.ceil(cell.length / cols);
        laneRows = Math.max(laneRows, rows);
        cell.forEach((p, k) =>
          nodes.push({
            id: p.id,
            type: "paper",
            position: { x: xOfYear.get(yr)! + (k % cols) * COL_W, y: y + Math.floor(k / cols) * ROW_H },
            draggable: false,
            data: { p, color: colorOf(p.branch), focus: p.id === focus, onOpen: onOpenPaper },
          }),
        );
      }
      // lane label at both ends, so it is visible wherever the view starts
      for (const [side, lx] of [["l", -220], ["r", x + 8]] as const)
        nodes.push({
          id: `lane:${side}:${lane}`,
          type: "lane",
          position: { x: lx, y: y + 4 },
          draggable: false,
          selectable: false,
          data: { label: lane, inside, count: papers.length, right: side === "r" },
        });
      y += laneRows * ROW_H + LANE_GAP;
    }

    for (const yr of years)
      nodes.push({
        id: `tick:${yr}`,
        type: "tick",
        position: { x: xOfYear.get(yr)!, y: -40 },
        draggable: false,
        selectable: false,
        data: { label: String(yr) },
      });

    const known = new Set(d.nodes.map((p) => p.id));
    for (const e of d.edges) {
      if (!known.has(e.s) || !known.has(e.t)) continue;
      const touchesFocus = focus && (e.s === focus || e.t === focus);
      if (!e.main && !touchesFocus && !showAll) continue;
      edges.push({
        id: `${e.s}>${e.t}`,
        source: e.s,
        target: e.t,
        selectable: false,
        style: {
          stroke: touchesFocus ? "#4f46e5" : e.main ? "#6366f1" : "#94a3b8",
          strokeOpacity: touchesFocus ? 0.9 : e.main ? 0.55 : 0.25,
          strokeWidth: touchesFocus ? 1.8 : 1.2,
        },
      });
    }
    return { nodes, edges, width: x };
  }, [d, focus, colorOf, onOpenPaper, showAll]);

  // Open on the newest years (where the activity is) at a readable zoom; the controls zoom out.
  const { setViewport } = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!width) return;
    const t = setTimeout(() => {
      const w = box.current?.clientWidth ?? 900;
      const zoom = 0.8;
      setViewport({ x: Math.min(240 * zoom, w - (width + 210) * zoom), y: 130, zoom }, { duration: 300 });
    }, 80);
    return () => clearTimeout(t);
  }, [key, width, setViewport]);

  if (err)
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="max-w-md rounded-xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-800">{err}</p>
      </div>
    );
  if (!d)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Tracing the citation lineage…
      </div>
    );
  if (!d.nodes.length)
    return (
      <div className="flex h-full items-center justify-center p-8 text-[13px] text-slate-500">
        No citation links known here yet. References load in the background as papers arrive.
      </div>
    );

  return (
    <div ref={box} className="relative h-full">
      <ReactFlow
        key={key}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => n.type === "paper" && onOpenPaper(n.id)}
        nodesConnectable={false}
        minZoom={0.1}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d4d8e0" />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      <div className="pointer-events-none absolute bottom-4 left-16 z-10 max-w-[560px] rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[11.5px] leading-relaxed text-slate-600 shadow-sm">
        <b className="text-slate-800">
          {target.kind === "paper" ? `Lineage of “${d.paper?.title.slice(0, 80) ?? "this paper"}”` : `Lineage of ${d.label ?? "this topic"}`}
        </b>
        <br />
        Columns are years, lanes are topics; each line runs from a paper back to the work it cites. Faded
        lanes are other topics this lineage is intertwined with. Showing each paper&apos;s main line of descent;
        click a paper for all its links.
        {d.coverage && ` References known for ${d.coverage.with_references} of ${d.coverage.papers} papers here.`}
        <label className="pointer-events-auto mt-1 flex items-center gap-1.5 text-slate-700">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show every
          citation ({d.edges.length})
        </label>
      </div>
    </div>
  );
}
