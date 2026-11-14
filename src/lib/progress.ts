import { childrenOf } from "./tree";
import type { TreeNode, TreeProgress, WorkStage } from "./types";

// Progress of the team's work on sub-hypotheses: who's on what, how far along
// it is, and how many of its experiments have results.

export const STAGES: WorkStage[] = ["not_started", "in_progress", "done"];

export const STAGE_LABEL: Record<WorkStage, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

export const stageOf = (node: TreeNode): WorkStage => node.stage ?? "not_started";

/** The sub-hypotheses that count towards progress (folded-away ideas don't). */
export function activeSubHypotheses(nodes: TreeNode[]) {
  return nodes.filter((n) => n.kind === "hypothesis" && !n.folded);
}

/** Experiments directly under a sub-hypothesis, and how many have results. */
export function experimentProgress(nodes: TreeNode[], id: string) {
  const experiments = childrenOf(nodes, id).filter((n) => n.kind === "experiment" && !n.folded);
  return {
    total: experiments.length,
    withResults: experiments.filter((e) => e.result).length,
  };
}

export function treeProgress(nodes: TreeNode[]): TreeProgress {
  const subs = activeSubHypotheses(nodes);
  const assignees = new Set<string>();
  const out: TreeProgress = {
    total: subs.length,
    notStarted: 0,
    inProgress: 0,
    done: 0,
    unassigned: 0,
    assigneeIds: [],
  };
  for (const n of subs) {
    const stage = stageOf(n);
    if (stage === "done") out.done++;
    else if (stage === "in_progress") out.inProgress++;
    else out.notStarted++;
    if (!n.assignees?.length) out.unassigned++;
    n.assignees?.forEach((uid) => assignees.add(uid));
  }
  out.assigneeIds = [...assignees].sort();
  return out;
}

export function sameProgress(a: TreeProgress | undefined, b: TreeProgress) {
  return (
    !!a &&
    a.total === b.total &&
    a.notStarted === b.notStarted &&
    a.inProgress === b.inProgress &&
    a.done === b.done &&
    a.unassigned === b.unassigned &&
    a.assigneeIds.join() === b.assigneeIds.join()
  );
}
