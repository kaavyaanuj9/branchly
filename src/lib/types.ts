// The "shapes" of the data Branchly works with.
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

/** Where the team's work on a sub-hypothesis stands. */
export type WorkStage = "not_started" | "in_progress" | "done";

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

  // Sub-hypothesis teamwork fields
  /** Team members (uids) working on this sub-hypothesis. */
  assignees?: string[];
  /** How far along the work is. Missing means "not_started". */
  stage?: WorkStage;

  /** Creation sequence, so siblings keep their order when synced from Firestore. */
  order?: number;

  /** Children hidden from view ("Collapse this branch"). */
  collapsed?: boolean;
  /** Idea that didn't hold up, folded away but kept for the record. */
  folded?: boolean;
  /** Research Tree alert watching the field for new papers on this box (its token). */
  fieldWatch?: string;
  /** Where this box sits on the field map (a Research Tree topic id), and for which title. */
  fieldTopic?: string;
  /** The query fieldTopic was computed for (re-placed when the title or parent changes). */
  fieldTopicFor?: string;
  /** Located, but no clear home on the field map (placement confidence too low). */
  fieldNoHome?: boolean;
  /** How crowded this idea's neighbourhood is: of the 20 closest papers, how many address it. */
  fieldNovelty?: "crowded" | "related" | "sparse";
  fieldRelevant?: number;
  /** Papers the box's field alert has matched, and those the team has already looked at. */
  fieldHits?: string[];
  fieldSeen?: string[];
  /** What this experiment's result was reported to the field as (dead_end / promising / note). */
  fieldReported?: string;
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

// ── Research teams ──────────────────────────────────────────────────────────

/** What a team member is allowed to do. */
export type Role = "owner" | "editor" | "viewer";

export interface MemberProfile {
  name: string;
  email: string;
  photoURL: string | null;
}

/** A research team (Firestore `teams/{id}`). Every user also has a personal one. */
export interface Team {
  id: string;
  name: string;
  personal: boolean;
  roles: Record<string, Role>;
  memberIds: string[];
  members: Record<string, MemberProfile>;
}

/** A hypothesis tree owned by a team (Firestore `teams/{teamId}/trees/{id}`). */
export interface TreeMeta {
  id: string;
  title: string;
  createdBy: string;
  updatedAt: number;
  /** Summary of its sub-hypotheses, kept up to date by editors' clients. */
  progress?: TreeProgress;
}

/** Counts across a tree's (non-folded) sub-hypotheses, for the team page. */
export interface TreeProgress {
  total: number;
  notStarted: number;
  inProgress: number;
  done: number;
  unassigned: number;
  /** Everyone assigned to at least one sub-hypothesis, sorted. */
  assigneeIds: string[];
}

/** A pending invitation to join a team (Firestore `invites/{id}`). */
export interface Invite {
  id: string;
  teamId: string;
  teamName: string;
  role: Exclude<Role, "owner">;
  inviteeUid: string;
  inviteeEmail: string;
  invitedBy: { uid: string; name: string };
  createdAt: number;
}
