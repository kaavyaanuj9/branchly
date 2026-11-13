"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore } from "@/lib/store";
import { childrenOf, descendantIds, layoutTree, NODE_WIDTH } from "@/lib/tree";
import { HypoNode, type HypoFlowNode } from "./HypoNode";

// The zoomable, pannable tree. We turn our tree data into the "nodes" and
// "edges" (lines) that React Flow knows how to draw.

const nodeTypes = { hypo: HypoNode };

export function TreeCanvas() {
  const { state, dispatch } = useStore();
  const { fitView, setCenter, getZoom } = useReactFlow();

  const { flowNodes, flowEdges } = useMemo(() => {
    const placed = layoutTree(state.nodes);
    const visible = new Set(placed.map((p) => p.node.id));

    const flowNodes: HypoFlowNode[] = placed.map(({ node, x, y, depth }) => {
      // The main idea is a bit wider; shift it so it stays centred.
      const width = node.kind === "root" ? NODE_WIDTH + 70 : NODE_WIDTH;
      return {
        id: node.id,
        type: "hypo",
        position: { x: x - (width - NODE_WIDTH) / 2, y },
        selected: node.id === state.selectedId,
        draggable: false,
        data: {
          node,
          depth,
          childCount: childrenOf(state.nodes, node.id).length,
          hiddenCount: descendantIds(state.nodes, node.id).length,
        },
      };
    });

    const flowEdges: Edge[] = state.nodes
      .filter((n) => n.parentId && visible.has(n.id) && visible.has(n.parentId))
      .map((n) => {
        // Thicker line = AI is more confident about this link (slide 11).
        const width = 1 + (n.confidence ?? 0.5) * 2.6;
        const color = n.folded
          ? "#cbd5e1"
          : n.kind === "experiment"
            ? "#e3a3a3"
            : n.kind === "suggestion"
              ? "#38bdf8"
              : "#8b97e6";
        return {
          id: `${n.parentId}-${n.id}`,
          source: n.parentId!,
          target: n.id,
          type: "default",
          animated: n.kind === "suggestion",
          selectable: false,
          style: {
            stroke: color,
            strokeWidth: width,
            strokeDasharray: n.kind === "suggestion" || n.folded ? "5 4" : undefined,
          },
        };
      });

    return { flowNodes, flowEdges };
  }, [state.nodes, state.selectedId]);

  // Move the view when something changes:
  // - a box is selected: glide to it so it stays visible next to the panels
  // - nothing selected: zoom out to show the whole tree
  const shapeKey = flowNodes.map((n) => n.id).join("|");
  const selectedNode = flowNodes.find((n) => n.id === state.selectedId);
  const focusX = selectedNode ? selectedNode.position.x + NODE_WIDTH / 2 : null;
  const focusY = selectedNode ? selectedNode.position.y + 70 : null;
  const firstFit = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => {
      if (focusX !== null && focusY !== null) {
        setCenter(focusX, focusY, { zoom: Math.max(getZoom(), 0.85), duration: 450 });
      } else {
        fitView({ padding: 0.15, duration: firstFit.current ? 0 : 450, maxZoom: 1.1 });
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
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#d4d8e0" />
      <Controls position="bottom-left" showInteractive={false} />

    </ReactFlow>
  );
}
