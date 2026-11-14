import type { TreeNode } from "./types";

// Helper functions for walking the tree, plus the code that decides
// where each box sits on the screen.

export const NODE_WIDTH = 176;
export const ROOT_WIDTH = 188;
const COL = 212; // from one column of boxes to the next
const ROW = 150; // vertical room for one box
const ROW_SUGGESTION = 132;
/** Rough box heights, so a parent sits level with the middle of its children. */
const HEIGHT: Record<TreeNode["kind"], number> = { root: 196, hypothesis: 104, experiment: 80, suggestion: 104 };

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
 * A left-to-right "tidy tree": the main idea on the left, each level in its own column,
 * leaves stacked top to bottom, and each parent level with the middle of its children.
 */
export function columnX(depth: number) {
  return depth === 0 ? 0 : ROOT_WIDTH + 46 + (depth - 1) * COL;
}

export function layoutTree(nodes: TreeNode[]): PlacedNode[] {
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return [];

  const placed: PlacedNode[] = [];
  let nextY = 0;

  function place(node: TreeNode, depth: number): number {
    const kids = hidesChildren(node) ? [] : childrenOf(nodes, node.id);
    let center: number;
    if (kids.length === 0) {
      const room = node.kind === "suggestion" ? ROW_SUGGESTION : ROW;
      center = nextY + room / 2;
      nextY += room;
    } else {
      const cs = kids.map((k) => place(k, depth + 1));
      center = (cs[0] + cs[cs.length - 1]) / 2;
    }
    const h = node.folded ? 64 : HEIGHT[node.kind];
    placed.push({ node, x: columnX(depth), y: center - h / 2, depth });
    return center;
  }

  place(root, 0);
  return placed;
}

/** The ids from the main idea down to `id` (to darken the selected path). */
export function pathTo(nodes: TreeNode[], id: string | null): Set<string> {
  const out = new Set<string>();
  for (let cur = findNode(nodes, id); cur; cur = findNode(nodes, cur.parentId)) out.add(cur.id);
  return out;
}

export function shorten(text: string, max = 60) {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
