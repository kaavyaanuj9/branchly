import { complete, type LLMMessage } from "./llm";
import { literatureContext, locate } from "./researchTree";
import { formatCitation, searchSemanticScholar } from "./semanticScholar";

/** Real papers from the field map, appended to a system prompt (empty if the map is down). */
async function withLiterature(system: string, about: string): Promise<string> {
  const lit = await literatureContext(about);
  if (!lit) return system;
  return `${system}

RELEVANT LITERATURE (the closest papers in the Research Tree field map; cite them as [n] when you
use them, and say plainly when none of them addresses the question; never invent other citations):
${lit}`;
}
import type { Evidence, Proposal, TreeNode } from "./types";

/**
 * Extracts a structured Proposal object if Claude embedded one in a ```proposal block
 */
export function extractProposalFromClaudeResponse(rawText: string): {
  text: string;
  proposal?: Proposal;
} {
  const proposalRegex = /```proposal\s*([\s\S]*?)\s*```/i;
  const match = rawText.match(proposalRegex);

  if (!match) {
    return { text: rawText.trim() };
  }

  const cleanText = rawText.replace(proposalRegex, "").trim();
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && (parsed.kind === "hypothesis" || parsed.kind === "experiment") && parsed.title) {
      return {
        text: cleanText,
        proposal: {
          kind: parsed.kind,
          title: parsed.title,
          rationale: parsed.rationale || "Proposed by AI assistant based on our discussion.",
          goal: parsed.goal,
          steps: Array.isArray(parsed.steps) ? parsed.steps : undefined,
          expectedResult: parsed.expectedResult,
        },
      };
    }
  } catch {
    // If JSON parsing fails, retain the raw text
  }

  return { text: rawText.trim() };
}

/**
 * Executes a conversation turn with Claude Sonnet 5.5 scoped to a specific node in the tree.
 */
export async function chatWithNodeAgent({
  node,
  parent,
  children,
  history,
  question,
}: {
  node: TreeNode;
  parent?: TreeNode;
  children: TreeNode[];
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
}): Promise<{ text: string; proposal?: Proposal }> {

  const roleTitle =
    node.kind === "root"
      ? "Literature & Foundation Agent"
      : node.kind === "experiment"
        ? "Experiment Design & Validation Agent"
        : node.kind === "suggestion"
          ? "Explorer & Alternative Mechanism Agent"
          : "Hypothesis Validation Agent";

  const contextPrompt = `You are a world-class scientific co-investigator acting as the "${roleTitle}" for a specific node in an interactive hypothesis tree.
The scientist is testing and validating scientific ideas with you.

CURRENT NODE DETAILS:
- Node Kind: ${node.kind}
- Node Title / Claim: "${node.title}"
- Current Status: ${node.status}
${node.rationale ? `- Rationale (why linked): "${node.rationale}"` : ""}
${node.lens ? `- Scientific Lens: "${node.lens}"` : ""}
${node.confidence !== undefined ? `- AI Link Confidence: ${Math.round(node.confidence * 100)}%` : ""}
${node.goal ? `- Experiment Goal: "${node.goal}"` : ""}
${node.steps && node.steps.length > 0 ? `- Protocol Steps:\n${node.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}` : ""}
${node.expectedResult ? `- Expected Result: "${node.expectedResult}"` : ""}
${
  node.result
    ? `- Uploaded Result: Outcome = ${node.result.outcome}, Notes = "${node.result.notes}", Interpretation = "${node.result.interpretation}"`
    : ""
}
${
  node.evidence && node.evidence.length > 0
    ? `- Literature Evidence:\n${node.evidence.map((e) => `  • ${e.text} (${e.citation})`).join("\n")}`
    : "- Evidence: None registered yet."
}

TREE CONTEXT:
${parent ? `- Parent Node: "${parent.title}" (Kind: ${parent.kind}, Status: ${parent.status})` : "- Parent: Top-level root"}
${
  children.length > 0
    ? `- Child Branches (${children.length}):\n${children.map((c) => `  • [${c.kind} / ${c.status}] "${c.title}"`).join("\n")}`
    : "- Child Branches: None yet."
}

YOUR INSTRUCTIONS:
1. Speak with precision, scientific rigour, and intellectual curiosity.
2. Focus specifically on whether this claim holds up, what controls are necessary, and how to rigorously confirm or refute it.
3. If the user asks for a test, experiment, or sub-hypothesis—or whenever it is genuinely beneficial to propose one—include a structured proposal block at the end of your response using this exact JSON block format:

\`\`\`proposal
{
  "kind": "experiment" | "hypothesis",
  "title": "Clear concise statement or assay name",
  "rationale": "Direct rationale explaining why this tests or refines the idea",
  "goal": "Only for experiments: what the test verifies",
  "steps": ["Step 1", "Step 2", "Step 3"],
  "expectedResult": "Expected observable phenotype or metric"
}
\`\`\`

The user can click one button to accept your proposal into their hypothesis tree canvas. Keep your prose concise and impactful.`;

  const messages: LLMMessage[] = [
    ...history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user",
      content: question,
    },
  ];

  const groundedPrompt = await withLiterature(contextPrompt, [node.title, parent?.title].filter(Boolean).join(" — "));

  const rawText = await complete({
    system: groundedPrompt,
    messages: messages,
    maxTokens: 1500,
  });

  return extractProposalFromClaudeResponse(rawText);
}

/**
 * Uses Claude Sonnet 5.5 to interpret experimental results and, if contradictory or inconclusive,
 * generates three rigorous, distinct alternative hypotheses with concrete follow-up experiments.
 */
export async function interpretExperimentResultWithClaude({
  experiment,
  hypothesis,
  notes,
  outcome,
}: {
  experiment: TreeNode;
  hypothesis: TreeNode;
  notes: string;
  outcome: "supported" | "contradicted" | "inconclusive";
}): Promise<{
  interpretation: string;
  suggestions: Omit<TreeNode, "id" | "parentId">[];
}> {

  const systemPrompt = `You are a senior Principal Investigator and mechanistic biologist.
You are evaluating experimental results uploaded by a scientist for an experiment node in an interactive hypothesis tree.
You must return your analysis strictly as a valid JSON object.`;

  const userPrompt = `Hypothesis being tested:
"${hypothesis.title}"

Experiment details:
- Title: "${experiment.title}"
- Goal: "${experiment.goal || "Evaluate hypothesis"}"
- Expected Result: "${experiment.expectedResult || "Matches hypothesis predictions"}"

Scientist's Recorded Findings:
- Observation notes: "${notes}"
- Outcome classified as: "${outcome}"

TASK:
1. Provide a sharp, 2-4 sentence scientific reading ("interpretation") of what these findings indicate about the mechanism.
2. If the outcome is "contradicted" or "inconclusive", provide EXACTLY 3 distinct, creative, scientifically plausible alternative hypotheses explaining why the outcome differed from expectations. For each alternative:
   - "title": A clear scientific claim (e.g. "The observed sensitivity is driven by downstream compensatory pathway X rather than BCL-2 binding alone.")
   - "lens": One of "What else could explain it", "When might it not hold", "Direct mechanism", "Marker vs cause", or "Kinetic/temporal variation"
   - "confidence": Float between 0.35 and 0.85
   - "rationale": 1-2 sentences explaining why this alternative accounts for the anomalous finding
   - "proposedExperiment": {
       "title": "Assay title",
       "goal": "What the test determines",
       "steps": ["Step 1", "Step 2", "Step 3"],
       "expectedResult": "Expected observable readout"
     }

If the outcome is "supported", return an empty array for "suggestions".

Respond strictly with valid JSON with this shape:
{
  "interpretation": "...",
  "suggestions": [
    {
      "kind": "suggestion",
      "status": "untested",
      "lens": "...",
      "confidence": 0.65,
      "title": "...",
      "rationale": "...",
      "evidence": [],
      "proposedExperiment": {
        "title": "...",
        "goal": "...",
        "steps": ["..."],
        "expectedResult": "..."
      }
    }
  ]
}`;

  const rawText = await complete({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 2500,
  });

  // Parse JSON response
  let parsed: {
    interpretation: string;
    suggestions?: Omit<TreeNode, "id" | "parentId">[];
  };

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON object found in Claude's output");
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(
      `Failed to parse Claude interpretation response: ${err instanceof Error ? err.message : String(err)}. Raw response: ${rawText}`,
    );
  }

  return {
    interpretation: parsed.interpretation || "Results analyzed against hypothesis expectations.",
    suggestions: (parsed.suggestions || []).map((s) => ({
      kind: "suggestion",
      status: "untested",
      lens: s.lens || "Alternative mechanism",
      confidence: s.confidence ?? 0.6,
      title: s.title,
      rationale: s.rationale,
      evidence: [],
      proposedExperiment: s.proposedExperiment,
    })),
  };
}

/**
 * Automatically breaks down a hypothesis into candidate sub-hypotheses or experiments using Claude Sonnet 5.5.
 */
export async function decomposeHypothesisWithClaude({
  node,
  parent,
}: {
  node: TreeNode;
  parent?: TreeNode;
}): Promise<{
  candidates: {
    kind: "hypothesis" | "experiment";
    title: string;
    lens: string;
    rationale: string;
    confidence: number;
    goal?: string;
    steps?: string[];
    expectedResult?: string;
  }[];
}> {

  const systemPrompt = `You are an expert scientific strategist specializing in breaking down hypotheses into testable sub-claims and definitive experiments.
Return strictly a valid JSON object.`;

  const userPrompt = `Hypothesis to decompose:
"${node.title}"
${node.rationale ? `Rationale: "${node.rationale}"` : ""}
${parent ? `Parent context: "${parent.title}"` : ""}

Generate 3 high-leverage branch proposals (sub-hypotheses or experiments) that critically test or de-risk this claim:
- Propose at least 1 sub-hypothesis ("kind": "hypothesis") representing a necessary precondition ("What must be true") or vulnerability ("When might it not hold").
- Propose at least 1 experiment ("kind": "experiment") with a clean goal, steps, and expected result.

JSON format:
{
  "candidates": [
    {
      "kind": "hypothesis" | "experiment",
      "title": "Clear concise claim or experiment title",
      "lens": "e.g. What must be true | When might it not hold | Direct mechanism",
      "rationale": "Why this branch is essential to test",
      "confidence": 0.75,
      "goal": "Only if kind is experiment",
      "steps": ["Step 1", "Step 2"],
      "expectedResult": "Expected outcome"
    }
  ]
}`;

  const rawText = await complete({
    system: await withLiterature(systemPrompt, node.title),
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 2000,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Failed to extract valid JSON from Claude decomposition: ${rawText}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return { candidates: parsed.candidates || [] };
}

/**
 * Analyzes the relevance and impact of a paper from Semantic Scholar on a hypothesis node.
 */
export async function analyzePaperImpactWithClaude({
  paperTitle,
  abstract,
  tldr,
  citation,
  nodeTitle,
}: {
  paperTitle: string;
  abstract?: string | null;
  tldr?: string | null;
  citation: string;
  nodeTitle: string;
}): Promise<{
  supportsHypothesis: boolean | null;
  summary: string;
  evidenceExtract: string;
}> {

  const systemPrompt = `You are a literature curation agent assessing whether a published paper supports or challenges a scientific hypothesis. Return strictly valid JSON.`;

  const userPrompt = `Hypothesis: "${nodeTitle}"
Paper Title: "${paperTitle}"
Citation: "${citation}"
TLDR: "${tldr || "N/A"}"
Abstract: "${abstract || "N/A"}"

Analyze how this paper connects to the hypothesis.
Provide:
1. "supportsHypothesis": true if it primarily supports, false if it challenges/contradicts, null if background or inconclusive.
2. "summary": 2-3 sentences explaining the specific relevance of this study's findings to the hypothesis.
3. "evidenceExtract": A concise, standalone factual statement (1-2 sentences) suitable for adding directly into the hypothesis's evidence list.

JSON shape:
{
  "supportsHypothesis": true | false | null,
  "summary": "...",
  "evidenceExtract": "..."
}`;

  const rawText = await complete({
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 800,
  });

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse paper analysis JSON: ${rawText}`);
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Idea studio: turn a scientist's rough idea (and any follow-up messages) into one sharp,
 * testable hypothesis, split into problem / method / setting for the field check.
 */
export interface Formulation {
  reply: string;
  hypothesis: string;
  problem: string;
  method: string;
  setting: string;
  why: string;
}

export async function formulateIdeaWithClaude(
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<Formulation> {
  const system = `You help a biomedical scientist turn a rough idea into ONE sharp, testable hypothesis.
- Keep their intent; make it specific (what causes what, in which system) and falsifiable.
- One sentence, at most ~35 words, no hedging words like "may" or "might".
- Split it into: problem (the question or phenomenon), method (the intervention or approach), setting (the model system or population). Leave a part "" if the idea really has none.
- "reply": 1-2 friendly sentences to the scientist: what you sharpened and, if useful, one question that would make it better. No [n] citation markers here: the papers are shown separately.
- "why": one sentence on what result would support it and what would refute it.
When they reply with changes, revise the hypothesis accordingly.
Return ONLY a JSON object: {"reply": "...", "hypothesis": "...", "problem": "...", "method": "...", "setting": "...", "why": "..."}`;
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const raw = await complete({
    system: await withLiterature(system, lastUser),
    messages: messages.map((m) => ({ role: m.role, content: m.content })) as LLMMessage[],
    maxTokens: 800,
  });
  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("Claude did not return a hypothesis. Please try again.");
  const f = JSON.parse(json[0]) as Partial<Formulation>;
  if (!f.hypothesis) throw new Error("Claude did not return a hypothesis. Please try again.");
  return {
    reply: f.reply || "Here is a sharper, testable version.",
    hypothesis: f.hypothesis,
    problem: f.problem || "",
    method: f.method || "",
    setting: f.setting || "",
    why: f.why || "",
  };
}


// ── Full tree generation (from the team's main branch, adapted to Branchly's AI backend) ──

interface GeneratedSubHypothesis {
  title: string;
  lens: string;
  rationale: string;
  confidence: number;
  literatureQuery: string;
  experiments: {
    title: string;
    goal: string;
    steps: string[];
    expectedResult: string;
    rationale?: string;
    confidence?: number;
  }[];
}

interface GeneratedTree {
  rootLiteratureQuery: string;
  subHypotheses: GeneratedSubHypothesis[];
}

/** Papers for one claim: Semantic Scholar first, the field map's closest papers if that fails. */
async function papersFor(query: string, claim: string, n: number): Promise<Evidence[]> {
  try {
    const r = await searchSemanticScholar(query, n);
    if (r.papers.length)
      return r.papers.map((p) => ({
        text: p.abstract ? `${p.abstract.slice(0, 240)}…` : p.title,
        citation: formatCitation(p.authors, p.year, p.venue),
        url: p.url || undefined,
        year: p.year || undefined,
        paperId: p.paperId,
      }));
  } catch (e) {
    console.warn(`Semantic Scholar found nothing for "${query}":`, e);
  }
  try {
    const r = await locate(claim);
    return r.nearest.slice(0, n).map((p) => {
      const first = (p.authors?.[0] || "Unknown").replace(/,.*$/, "").split(" ").slice(-1)[0];
      const year = new Date(p.announced * 1000).getFullYear();
      return {
        text: p.abstract ? `${p.abstract.slice(0, 240)}…` : p.title,
        citation: `${first}${(p.authors?.length || 0) > 1 ? " et al." : ""}, ${year}`,
        url: p.url,
        year,
        paperId: p.id,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Breaks a main hypothesis into a complete validation tree in one go: 3-4 sub-hypotheses (what
 * must be true / what could cause it / when might it not hold / what else could explain it),
 * each with 1-2 planned experiments, and papers attached to the root and every sub-hypothesis.
 */
export async function generateFullHypothesisTree(mainHypothesis: string): Promise<TreeNode[]> {
  const system = `You are a world-class Principal Investigator, mechanistic biologist, and scientific research strategist.
Take a scientist's central hypothesis and decompose it into a complete, rigorous, testable hypothesis validation tree.

A complete hypothesis tree contains:
1. 3 to 4 distinct Sub-Hypotheses branching from the root, each from a different lens:
   - "What must be true": a necessary precondition, correlation, or dependency.
   - "What could cause it": the direct molecular, cellular, or causal mechanism.
   - "When might it not hold": boundary conditions, cellular context, resistant subgroups, kinetic limits.
   - "What else could explain it": competing hypotheses, non-specific toxicity, confounders.
2. For each Sub-Hypothesis:
   - "title": a precise, testable scientific claim.
   - "lens": one of the lenses above.
   - "rationale": why this link to the main hypothesis matters and what it establishes.
   - "confidence": float between 0.65 and 0.95.
   - "literatureQuery": a targeted 2-4 word Semantic Scholar query for papers on this specific claim.
   - 1 to 2 planned Experiments, each with "title", "goal", "steps" (3-4 protocol steps), "expectedResult" (a specific readout or threshold that would support or refute it), "rationale", and "confidence" (0.60-0.90).
3. A "rootLiteratureQuery": a targeted 2-4 word query for foundational literature on the main hypothesis.

Return ONLY a valid JSON object:
{"rootLiteratureQuery": "...", "subHypotheses": [{"title": "...", "lens": "...", "rationale": "...", "confidence": 0.85, "literatureQuery": "...", "experiments": [{"title": "...", "goal": "...", "steps": ["..."], "expectedResult": "...", "rationale": "...", "confidence": 0.8}]}]}

Keep rationale, goals, and steps concise and high-signal (1-2 sentences each) so the whole tree fits.`;

  const raw = await complete({
    system: await withLiterature(system, mainHypothesis),
    messages: [{ role: "user", content: `Central scientific hypothesis to decompose and validate:\n"${mainHypothesis.trim()}"` }],
    maxTokens: 6000,
  });

  let json = raw.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) json = fenced[1].trim();
  else {
    const a = raw.indexOf("{");
    const b = raw.lastIndexOf("}");
    if (a !== -1 && b > a) json = raw.slice(a, b + 1);
  }
  let tree: GeneratedTree;
  try {
    tree = JSON.parse(json) as GeneratedTree;
  } catch (err) {
    throw new Error(
      `Could not read the generated tree (${err instanceof Error ? err.message : String(err)}): ${raw.slice(0, 300)}…`,
    );
  }

  const nodes: TreeNode[] = [
    {
      id: "root",
      parentId: null,
      kind: "root",
      status: "untested",
      title: mainHypothesis.trim(),
      evidence: await papersFor(tree.rootLiteratureQuery || mainHypothesis.slice(0, 60), mainHypothesis, 3),
    },
  ];
  const subs = (tree.subHypotheses || []).slice(0, 4);
  for (let h = 0; h < subs.length; h++) {
    const sub = subs[h];
    const subId = `h${h + 1}`;
    nodes.push({
      id: subId,
      parentId: "root",
      kind: "hypothesis",
      status: "untested",
      title: sub.title,
      rationale: sub.rationale,
      lens: sub.lens,
      confidence: sub.confidence ?? 0.8,
      evidence: await papersFor(sub.literatureQuery || sub.title.slice(0, 60), sub.title, 2),
    });
    (sub.experiments || []).slice(0, 2).forEach((exp, e) =>
      nodes.push({
        id: `e${h + 1}${String.fromCharCode(97 + e)}`,
        parentId: subId,
        kind: "experiment",
        status: "planned",
        title: exp.title,
        goal: exp.goal,
        steps: exp.steps,
        expectedResult: exp.expectedResult,
        rationale: exp.rationale,
        confidence: exp.confidence ?? 0.75,
        evidence: [],
      }),
    );
  }
  return nodes;
}

/**
 * A box looks crowded on the field map: read the papers that most directly address it and say
 * how much of the claim they actually answer, where the gap is, and sharper versions aimed at it.
 */
export interface CrowdingCheck {
  verdict: "answered" | "partly" | "open";
  summary: string;
  gap: string;
  options: { title: string; why: string }[];
}

export async function assessCrowdingWithClaude({
  title,
  context,
  papers,
}: {
  title: string;
  context?: string;
  papers: { title: string; abstract?: string; citation: string }[];
}): Promise<CrowdingCheck> {
  const system = `You help a biomedical research team decide whether a hypothesis is already answered by published work.
You get the hypothesis and the papers that most directly address it. Judge honestly:
- "answered": the papers already test this claim in substantially this form.
- "partly": they cover the broader question or a neighbouring mechanism, but not this specific claim.
- "open": they are related but do not test it.
"summary": 1-2 sentences on what the papers do establish, naming papers by their citation in parentheses.
"gap": one sentence on what remains untested (empty if fully answered).
"options": 2-3 sharper, testable rewordings of the hypothesis aimed at the gap (each <= 30 words), with "why" (one sentence on why it is less covered).
Return ONLY JSON: {"verdict": "...", "summary": "...", "gap": "...", "options": [{"title": "...", "why": "..."}]}`;
  const list = papers
    .slice(0, 5)
    .map((p, i) => `[${i + 1}] ${p.citation}: ${p.title}\n    ${(p.abstract || "").slice(0, 500)}`)
    .join("\n");
  const raw = await complete({
    system,
    messages: [
      {
        role: "user",
        content: `Hypothesis: "${title}"${context ? `\n(It sits under: "${context}")` : ""}\n\nPapers that most directly address it:\n${list}`,
      },
    ],
    maxTokens: 1200,
  });
  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("Couldn't read the literature check. Please try again.");
  const r = JSON.parse(json[0]) as Partial<CrowdingCheck>;
  return {
    verdict: r.verdict === "answered" || r.verdict === "open" ? r.verdict : "partly",
    summary: r.summary || "",
    gap: r.gap || "",
    options: (r.options || []).filter((o) => o && o.title).slice(0, 3),
  };
}
