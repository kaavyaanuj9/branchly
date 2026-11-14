"use client";

import { useEffect, useMemo, useRef } from "react";
import { Background, BackgroundVariant, Panel, ReactFlow, useReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Minus, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { childrenOf, descendantIds, layoutTree, NODE_WIDTH, pathTo } from "@/lib/tree";
import { HypoNode, type HypoFlowNode } from "./HypoNode";

// The zoomable, pannable tree, left to right. Lines are gray and thicker where the AI is
// more confident about the link; the path from the main idea to the selected box is dark.

const nodeTypes = { hypo: HypoNode };

export function TreeCanvas() {
  const { state, dispatch } = useStore();
  const { fitView, setCenter, getZoom, zoomIn, zoomOut } = useReactFlow();

  const { flowNodes, flowEdges } = useMemo(() => {
    const placed = layoutTree(state.nodes);
    const visible = new Set(placed.map((p) => p.node.id));
    const onPath = pathTo(state.nodes, state.selectedId);

    const flowNodes: HypoFlowNode[] = placed.map(({ node, x, y, depth }) => ({
      id: node.id,
      type: "hypo",
      position: { x, y },
      selected: node.id === state.selectedId,
      draggable: false,
      data: {
        node,
        depth,
        childCount: childrenOf(state.nodes, node.id).length,
        hiddenCount: descendantIds(state.nodes, node.id).length,
      },
    }));

    const flowEdges: Edge[] = state.nodes
      .filter((n) => n.parentId && visible.has(n.id) && visible.has(n.parentId))
      .map((n) => {
        const dark = onPath.has(n.id) && onPath.has(n.parentId!);
        const dashed = n.kind === "suggestion" || n.folded;
        const width = dashed ? 1.2 : 1.2 + (n.confidence ?? 0.5) * 3;
        return {
          id: `${n.parentId}-${n.id}`,
          source: n.parentId!,
          target: n.id,
          type: "default",
          selectable: false,
          style: {
            stroke: dark ? "#262626" : n.folded ? "#d4d4d4" : dashed ? "#8a8a8a" : "#b8b8b8",
            strokeWidth: dark ? width + 0.6 : width,
            strokeDasharray: dashed ? "4 4" : undefined,
          },
        };
      });

    return { flowNodes, flowEdges };
  }, [state.nodes, state.selectedId]);

  // Glide to a selected box; with nothing selected, show the whole tree.
  const shapeKey = flowNodes.map((n) => n.id).join("|");
  const selectedNode = flowNodes.find((n) => n.id === state.selectedId);
  const focusX = selectedNode ? selectedNode.position.x + NODE_WIDTH / 2 : null;
  const focusY = selectedNode ? selectedNode.position.y + 50 : null;
  const firstFit = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => {
      if (focusX !== null && focusY !== null && !firstFit.current) {
        setCenter(focusX, focusY, { zoom: Math.max(getZoom(), 0.85), duration: 450 });
      } else {
        fitView({ padding: 0.08, duration: firstFit.current ? 0 : 450, maxZoom: 1.05 });
      }
      firstFit.current = false;
    }, 60);
    return () => clearTimeout(t);
  }, [shapeKey, focusX, focusY, fitView, setCenter, getZoom]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => dispatch({ type: "select", id: n.id })}
      onPaneClick={() => dispatch({ type: "select", id: null })}
      nodesConnectable={false}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      fitView
      fitViewOptions={{ padding: 0.08, maxZoom: 1.05 }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d9d9d6" />
      <Panel position="bottom-left" className="!m-5 flex flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-sm">
        <button onClick={() => zoomIn({ duration: 200 })} title="Zoom in" className="flex size-8 items-center justify-center text-neutral-700 hover:bg-neutral-100">
          <Plus className="size-4" />
        </button>
        <span className="h-px bg-neutral-200" />
        <button onClick={() => zoomOut({ duration: 200 })} title="Zoom out" className="flex size-8 items-center justify-center text-neutral-700 hover:bg-neutral-100">
          <Minus className="size-4" />
        </button>
      </Panel>
      <Panel position="bottom-right" className="!m-5 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white/90 px-3 py-2 text-[11.5px] text-neutral-600 shadow-sm backdrop-blur">
        Confidence <span className="text-neutral-400">low</span>
        {[1, 1.5, 2.2].map((w) => (
          <span key={w} className="h-3.5 w-5 rounded-[4px] border-neutral-500" style={{ borderWidth: w }} />
        ))}
        <span className="text-neutral-400">high</span>
      </Panel>
    </ReactFlow>
  );
}
