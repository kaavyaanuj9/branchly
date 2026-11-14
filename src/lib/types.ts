// The "shapes" of the data HypoTree works with.
// TypeScript uses these to catch mistakes (e.g. a typo in a field name).

/** What kind of box this is in the tree. */
export type NodeKind =
  | "root" // the main idea at the top
  | "hypothesis" // a smaller idea (sub-hypothesis)
  | "experiment" // a test of a hypothesis
  | "suggestion"; // an AI-suggested idea waiting for the scientist's approval

/** Where an idea or experiment stands. */
export type Status =
  | "untested"
  | "planned"
  | "supported"
  | "contradicted"
  | "inconclusive";

/** A piece of evidence from the literature. */
export interface Evidence {
  text: string;
  citation: string;
  url?: string;
  year?: number;
  paperId?: string;
  tldr?: string;
}

/** A paper returned from the Semantic Scholar API. */
export interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract?: string | null;
  year?: number | null;
  venue?: string | null;
  url?: string | null;
  citationCount?: number | null;
  authors: { authorId?: string; name: string }[];
  tldr?: { model?: string; text: string } | null;
  openAccessPdf?: { url: string; status: string } | null;
}

/** A result the scientist uploaded for an experiment. */
export interface ExperimentResult {
  notes: string;
  files: string[];
  interpretation: string; // the AI's reading of what the result means
  outcome: Exclude<Status, "untested" | "planned">;
  recordedAt: string;
}

/** An experiment the AI proposes alongside a suggested idea. */
export interface ProposedExperiment {
  title: string;
  goal: string;
  steps: string[];
  expectedResult: string;
}

/** One box in the hypothesis tree. */
export interface TreeNode {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string; // the statement shown in the box
  status: Status;

  /** Why this box is linked to its parent (DG2: the "why" is never lost). */
  rationale?: string;
  /** How confident the AI is about the link, 0 to 1. Drawn as line thickness. */
  confidence?: number;
  /** Which way of breaking down the idea produced this box. */
  lens?: string;
  evidence: Evidence[];

  // Experiment-only fields
  goal?: string;
  steps?: string[];
  expectedResult?: string;
  result?: ExperimentResult;

  // AI-suggestion-only field
  proposedExperiment?: ProposedExperiment;

  /** Children hidden from view ("Collapse this branch"). */
  collapsed?: boolean;
  /** Idea that didn't hold up, folded away but kept for the record. */
  folded?: boolean;
  /** Research Tree alert watching the field for new papers on this box (its token). */
  fieldWatch?: string;
  foldedReason?: string;
}

/** A proposal attached to an AI chat message. Needs the scientist's approval. */
export interface Proposal {
  kind: "hypothesis" | "experiment";
  title: string;
  rationale: string;
  goal?: string;
  steps?: string[];
  expectedResult?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  proposal?: Proposal;
  proposalAccepted?: boolean;
}

export interface Project {
  title: string;
  nodes: TreeNode[];
}
