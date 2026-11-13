import type { ExperimentResult, Proposal, TreeNode } from "./types";
import { shorten } from "./tree";

// ─────────────────────────────────────────────────────────────────────────────
// A pretend AI assistant.
//
// For now HypoTree doesn't call any paid AI service. These functions build
// sensible-looking replies from the data already in the tree. Later, each of
// them can be swapped for a real call to a language model, and the rest of
// the app won't need to change.
// ─────────────────────────────────────────────────────────────────────────────

export const QUICK_PROMPTS = [
  "Why was this generated?",
  "What evidence supports this?",
  "What experiments could test this?",
];

export function agentRole(node: TreeNode) {
  switch (node.kind) {
    case "root":
      return "Literature agent";
    case "experiment":
      return "Experiment design agent";
    case "suggestion":
      return "Explorer agent";
    default:
      return "Validator agent";
  }
}

export function agentLabel(node: TreeNode) {
  switch (node.kind) {
    case "root":
      return "Paper hypothesis agent";
    case "experiment":
      return "Experiment agent";
    case "suggestion":
      return "Suggestion agent";
    default:
      return "Hypothesis agent";
  }
}

export function agentIntro(node: TreeNode) {
  const focus =
    node.kind === "experiment"
      ? "how this experiment is designed and what its results mean"
      : node.kind === "root"
        ? "the literature behind your main idea and how it breaks down"
        : "whether this specific claim holds up against evidence";
  return `Hi, I'm the ${agentRole(node)} for "${shorten(node.title, 90)}". I'm focused on ${focus}. Ask me what would confirm or refute it.`;
}

interface Context {
  parent?: TreeNode;
  children: TreeNode[];
}

export interface AgentReply {
  text: string;
  proposal?: Proposal;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const stripDot = (s: string) => s.replace(/\.$/, "");

export function getAgentReply(
  question: string,
  node: TreeNode,
  ctx: Context,
): AgentReply {
  const q = question.toLowerCase();

  // "Why was this generated?"
  if (q.includes("why")) {
    const parts = [
      node.rationale
        ? `I suggested this because: ${node.rationale}`
        : "This was added by you, so there's no AI rationale saved yet. You can add one with the edit button.",
    ];
    if (node.lens)
      parts.push(
        `It came from asking "${lower(node.lens)}?" when breaking down the parent idea.`,
      );
    if (ctx.parent)
      parts.push(`Parent: "${shorten(ctx.parent.title, 110)}"`);
    if (node.confidence !== undefined)
      parts.push(
        `My confidence in this link is ${Math.round(node.confidence * 100)}%. That's why its line in the tree is ${node.confidence >= 0.75 ? "thick" : node.confidence >= 0.55 ? "medium" : "thin"}.`,
      );
    return { text: parts.join("\n\n") };
  }

  // "What evidence supports this?"
  if (q.includes("evidence") || q.includes("support") || q.includes("paper")) {
    if (node.evidence.length === 0) {
      return {
        text: "I don't have papers saved for this box yet. Once the research-paper search is connected, I'll look for studies that support or challenge it. For now, a good starting point is the evidence on the parent idea.",
      };
    }
    const list = node.evidence
      .map((e) => `• ${e.text} (${e.citation})`)
      .join("\n");
    return {
      text: `Here's what supports this claim:\n\n${list}\n\nWorth noting: none of these directly tests this exact claim in your system. That's what an experiment is for.`,
    };
  }

  // "What experiments could test this?"
  if ((q.includes("experiment") || q.includes("test")) && node.kind === "suggestion") {
    const e = node.proposedExperiment;
    return {
      text: e
        ? `If you approve this idea, I'll add this experiment under it:\n\n"${e.title}"\nGoal: ${e.goal}\nExpected result: ${e.expectedResult}\n\nUse "Approve & test this" in the detail panel.`
        : "Approve this idea first, then I can propose experiments for it.",
    };
  }
  if (q.includes("experiment") || q.includes("test")) {
    if (node.kind === "experiment") {
      return {
        text: `This experiment aims to ${lower(stripDot(node.goal ?? "test the parent idea"))}.\n\nSteps:\n${(node.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nExpected result: ${node.expectedResult ?? "not set yet"}\n\nA useful extra would be a positive control, so a null result can be trusted.`,
      };
    }
    const existing = ctx.children.filter((c) => c.kind === "experiment");
    const intro = existing.length
      ? `There's already ${existing.length === 1 ? "an experiment" : `${existing.length} experiments`} on this idea: ${existing.map((e) => `"${e.title}"`).join(", ")}. Here's another angle you could add:`
      : "Here's an experiment that could test this directly:";
    return {
      text: intro,
      proposal: {
        kind: "experiment",
        title: `Perturbation test: ${shorten(stripDot(node.title), 48)}`,
        rationale: `Directly perturbs the proposed mechanism, so a change in outcome would support "${shorten(node.title, 70)}".`,
        goal: `Check whether ${lower(stripDot(shorten(node.title, 120)))}.`,
        steps: [
          "Pick a model system where the effect can be measured",
          "Perturb the key factor (knockdown, inhibitor, or dose change)",
          "Measure the outcome against an untreated control",
        ],
        expectedResult:
          "If the idea holds, the perturbation changes the outcome in the predicted direction.",
      },
    };
  }

  // "Break this down" / "suggest a sub-hypothesis"
  if (
    node.kind !== "suggestion" &&
    node.kind !== "experiment" &&
    (q.includes("break") || q.includes("sub") || q.includes("suggest") || q.includes("idea"))
  ) {
    return {
      text: 'One way to break this down is to ask "when might it not hold?". Here\'s a sub-hypothesis built that way:',
      proposal: {
        kind: "hypothesis",
        title: `The effect described in "${shorten(stripDot(node.title), 60)}" depends on cell context and is weaker in resistant subgroups.`,
        rationale:
          "Testing the boundary conditions of an idea often reveals where it breaks, which is just as informative as confirming it.",
      },
    };
  }

  // Anything else
  return {
    text: `Good question. Thinking about "${shorten(node.title, 80)}"…\n\nThe most useful next step is usually to name what result would change your mind. If you can describe that, I can help design the experiment around it. You can also ask me to suggest a sub-hypothesis.\n\n(Demo mode: replies are simulated. A real AI model will be connected later.)`,
  };
}

/** What the AI "says" after a result is uploaded. */
export function interpretResult(
  experiment: TreeNode,
  outcome: ExperimentResult["outcome"],
): string {
  const expected = experiment.expectedResult
    ? ` The expected result was: "${experiment.expectedResult}"`
    : "";
  if (outcome === "supported")
    return `The result is in line with what we expected.${expected} This supports the parent idea. Still worth checking: whether the effect holds in a second, independent sample.`;
  if (outcome === "contradicted")
    return `This goes against the hypothesis.${expected} Rather than a failure, this is a clue about what to change. I've suggested three new ideas below. Pick one to test next.`;
  return `The result is unclear: it neither clearly supports nor contradicts the idea.${expected} Consider repeating the test with more samples or adding a comparison group.`;
}

/** Three AI-suggested new ideas after an unexpected result (see slide 9). */
export function suggestAlternatives(
  hypothesis: TreeNode,
  experiment: TreeNode,
): Omit<TreeNode, "id" | "parentId">[] {
  const h = shorten(stripDot(hypothesis.title), 70);
  return [
    {
      kind: "suggestion",
      status: "untested",
      lens: "What else could explain it",
      confidence: 0.65,
      title:
        "The factor we measured is a marker of which cells respond, not the cause of the effect.",
      rationale: `The result went against "${h}". That fits a correlation-without-causation explanation.`,
      evidence: [],
      proposedExperiment: {
        title: "Compare several matched cell types",
        goal: "See if the marker predicts response across different cell types.",
        steps: [
          "Pick several high- and low-marker cell types of the same kind",
          "Apply the same treatment to all of them",
          "Compare survival between groups",
        ],
        expectedResult: "Marker level predicts response across cell types.",
      },
    },
    {
      kind: "suggestion",
      status: "untested",
      lens: "When might it not hold",
      confidence: 0.5,
      title: "The experiment was too short-term to show the expected difference.",
      rationale: `Some effects take longer to appear than the time window measured in "${shorten(experiment.title, 60)}".`,
      evidence: [],
      proposedExperiment: {
        title: "Extended time-course",
        goal: "Check whether a difference appears at later time points.",
        steps: [
          "Repeat the experiment",
          "Measure at three later time points",
          "Compare groups at each point",
        ],
        expectedResult: "A difference appears at the later time points.",
      },
    },
    {
      kind: "suggestion",
      status: "untested",
      lens: "What could cause it",
      confidence: 0.4,
      title:
        "The effect is linked to the disease subtype, not to the treatment itself.",
      rationale:
        "Subtype can confound both the marker and the response. Separating them clarifies the cause.",
      evidence: [],
      proposedExperiment: {
        title: "Stratify by subtype",
        goal: "Separate the effect of subtype from the effect of treatment.",
        steps: [
          "Group samples by subtype",
          "Re-analyze the result within each subtype",
          "Compare effect sizes",
        ],
        expectedResult: "The effect disappears within a single subtype.",
      },
    },
  ];
}
