import type { ChatMessage, Proposal, TreeNode } from "./types";
import { shorten } from "./tree";

export const QUICK_PROMPTS = [
  "Why was this generated?",
  "What evidence supports this?",
  "What experiments could test this?",
  "Propose a sub-hypothesis testing a boundary condition",
];

export function agentRole(node: TreeNode) {
  switch (node.kind) {
    case "root":
      return "Literature & Foundation Agent";
    case "experiment":
      return "Experiment Design & Protocol Agent";
    case "suggestion":
      return "Explorer & Counter-Hypothesis Agent";
    default:
      return "Validator & Mechanistic Agent";
  }
}

export function agentLabel(node: TreeNode) {
  switch (node.kind) {
    case "root":
      return "Literature Agent";
    case "experiment":
      return "Experiment Agent";
    case "suggestion":
      return "Explorer Agent";
    default:
      return "Validator Agent";
  }
}

export function agentIntro(node: TreeNode) {
  const focus =
    node.kind === "experiment"
      ? "evaluating this protocol, potential confounders, and interpreting outcomes"
      : node.kind === "root"
        ? "the published literature behind your main thesis and how it breaks down"
        : "whether this specific mechanistic claim holds up under empirical scrutiny";
  return `Hi, I am your ${agentRole(node)} powered by Claude Sonnet 5.5 for "${shorten(node.title, 90)}". I am focused on ${focus}. Ask me to critique this, suggest experiments, or evaluate relevant evidence.`;
}

export interface AgentReply {
  text: string;
  proposal?: Proposal;
}

/**
 * Sends question and full node context to Claude Sonnet 5.5 via /api/chat.
 * Does NOT use any mock or placeholder fallback.
 */
export async function getAgentReply(
  question: string,
  node: TreeNode,
  ctx: { parent?: TreeNode; children: TreeNode[] },
  history: ChatMessage[] = [],
): Promise<AgentReply> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      node,
      parent: ctx.parent,
      children: ctx.children,
      question,
      history: history.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Claude API error (HTTP ${res.status})`);
  }

  return {
    text: data.text,
    proposal: data.proposal,
  };
}

/**
 * Sends experimental observations to Claude Sonnet 5.5 to interpret the result
 * and generate alternative hypotheses if contradicted.
 * No mock or placeholder logic.
 */
export async function interpretResultWithAI(
  experiment: TreeNode,
  hypothesis: TreeNode,
  notes: string,
  outcome: "supported" | "contradicted" | "inconclusive",
): Promise<{
  interpretation: string;
  suggestions: Omit<TreeNode, "id" | "parentId">[];
}> {
  const res = await fetch("/api/interpret-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      experiment,
      hypothesis,
      notes,
      outcome,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Claude API interpretation error (HTTP ${res.status})`);
  }

  return {
    interpretation: data.interpretation,
    suggestions: data.suggestions || [],
  };
}

/**
 * Automatically decomposes a hypothesis into candidate sub-claims or tests using Claude Sonnet 5.5.
 */
export async function decomposeHypothesisWithAI(
  node: TreeNode,
  parent?: TreeNode,
): Promise<
  {
    kind: "hypothesis" | "experiment";
    title: string;
    lens: string;
    rationale: string;
    confidence: number;
    goal?: string;
    steps?: string[];
    expectedResult?: string;
  }[]
> {
  const res = await fetch("/api/decompose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ node, parent }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Claude decomposition error (HTTP ${res.status})`);
  }

  return data.candidates || [];
}
