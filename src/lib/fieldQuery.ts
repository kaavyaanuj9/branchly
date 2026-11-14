import type { TreeNode } from "./types";

/** Placement below this share of nearest-paper votes means "no clear home on the map". */
export const MIN_PLACEMENT_CONFIDENCE = 0.35;

/**
 * The text used to find a box on the field map. Sub-ideas are often short and lean on their
 * parent for context ("The pattern is not explained only by general cytotoxicity"), so the
 * parent idea is included; on its own such a sentence matches on generic words.
 */
export function fieldQuery(node: TreeNode, parent?: TreeNode): string {
  if (!parent || parent.kind === "experiment") return node.title;
  return `${node.title} (context: ${parent.title})`;
}
