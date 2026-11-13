import type { TreeNode } from "./types";

// Helper functions for walking the tree, plus the code that decides
// where each box sits on the screen.

export const NODE_WIDTH = 232;
const H_GAP = 28;
const LEVEL_HEIGHT = 215;

export function childrenOf(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes.filter((n) => n.parentId === id);
}

export function findNode(nodes: TreeNode[], id: string | null) {
  return id ? nodes.find((n) => n.id === id) : undefined;
}

/** Every id below `id` (children, grandchildren, ...). */
export function descendantIds(nodes: TreeNode[], id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of childrenOf(nodes, current)) {
      out.push(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

/** Children are hidden when a box is collapsed or folded away. */
export function hidesChildren(node: TreeNode) {
  return Boolean(node.collapsed || node.folded);
}

export interface PlacedNode {
  node: TreeNode;
  x: number;
  y: number;
  depth: number;
}

/**
 * A simple "tidy tree" layout:
 * - leaves are placed side by side, left to right
 * - each parent is centred above its children
 * - each level of the tree sits on its own row
 */
export function layoutTree(nodes: TreeNode[]): PlacedNode[] {
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return [];

  const placed: PlacedNode[] = [];
  let nextLeafX = 0;
  const slot = NODE_WIDTH + H_GAP;

  function place(node: TreeNode, depth: number): number {
    const kids = hidesChildren(node) ? [] : childrenOf(nodes, node.id);
    let x: number;
    if (kids.length === 0) {
      x = nextLeafX;
      nextLeafX += slot;
    } else {
      const xs = kids.map((k) => place(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    placed.push({ node, x, y: depth * LEVEL_HEIGHT, depth });
    return x;
  }

  place(root, 0);
  return placed;
}

export function shorten(text: string, max = 60) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
