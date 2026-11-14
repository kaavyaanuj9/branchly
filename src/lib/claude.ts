import Anthropic from "@anthropic-ai/sdk";
import type { Evidence, Proposal, TreeNode } from "./types";
import { formatCitation, searchSemanticScholar } from "./semanticScholar";

export function getAnthropicClient(): { client: Anthropic; model: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Please add your Anthropic API key to .env.local (ANTHROPIC_API_KEY=sk-ant-...)",
    );
  }

  // Uses Sonnet 5.5 as requested, overridable via ANTHROPIC_MODEL env var
  let model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
  // Normalize dot notation e.g. "claude-sonnet-5.5" -> "claude-sonnet-5-5"
  if (model === "claude-sonnet-5.5" || model === "sonnet-5.5" || model === "sonnet-5-5") {
    model = "claude-sonnet-5-5";
  }
  const client = new Anthropic({ apiKey });
  return { client, model };
}

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
  const { client, model } = getAnthropicClient();

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

  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user",
      content: question,
    },
  ];

  const response = await client.messages.create({
    model,
    max_tokens: 1500,
    system: contextPrompt,
    messages,
  });

  const rawText = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as Anthropic.TextBlock).text)
    .join("\n");

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
  const { client, model } = getAnthropicClient();

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

  const response = await client.messages.create({
    model,
    max_tokens: 2500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as Anthropic.TextBlock).text)
    .join("\n");

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
  const { client, model } = getAnthropicClient();

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

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as Anthropic.TextBlock).text)
    .join("\n");

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
  const { client, model } = getAnthropicClient();

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

  const response = await client.messages.create({
    model,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as Anthropic.TextBlock).text)
    .join("\n");

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse paper analysis JSON: ${rawText}`);
  }

  return JSON.parse(jsonMatch[0]);
}

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

interface GeneratedTreeStructure {
  rootLiteratureQuery: string;
  subHypotheses: GeneratedSubHypothesis[];
}

/**
 * Uses Claude Sonnet 5.5 to break down a main hypothesis into a complete validation tree,
 * and fetches peer-reviewed papers with citations from Semantic Scholar for every sub-hypothesis.
 */
export async function generateFullHypothesisTree(mainHypothesis: string): Promise<TreeNode[]> {
  const { client, model } = getAnthropicClient();

  const systemPrompt = `You are a world-class Principal Investigator, mechanistic biologist, and scientific research strategist.
Your role is to take a scientist's central hypothesis and decompose it into a complete, rigorous, testable hypothesis validation tree.

A complete hypothesis tree must contain:
1. 3 to 4 distinct Sub-Hypotheses branching from the root, exploring essential scientific angles/lenses:
   - "What must be true": A necessary precondition, correlation, or dependency required for the hypothesis to hold.
   - "What could cause it": The direct molecular, cellular, or causal mechanism through which the effect occurs.
   - "When might it not hold": Boundary conditions, cellular context, resistant subgroups, or kinetic/temporal limitations.
   - "What else could explain it": Alternative competing hypotheses, non-specific toxicity, or confounding variables.
2. For each Sub-Hypothesis:
   - "title": A precise, testable scientific claim.
   - "lens": One of the lenses above.
   - "rationale": Clear explanation of why this link to the main hypothesis is crucial and what it establishes.
   - "confidence": Float between 0.65 and 0.95.
   - "literatureQuery": A highly targeted 2-4 word search query for Semantic Scholar to retrieve published peer-reviewed papers relevant to this specific claim (e.g. 'BH3 profiling venetoclax CLL', 'TP53 independent venetoclax apoptosis').
   - 1 to 2 concrete planned Experiments under that sub-hypothesis:
     - "title": Name of the empirical assay/experiment.
     - "goal": Clear statement of what the experiment will measure or test.
     - "steps": Array of 3-4 protocol steps.
     - "expectedResult": Specific observable readout or threshold that would support or refute the sub-hypothesis.
     - "rationale": Why this experiment directly tests the claim.
     - "confidence": Float between 0.60 and 0.90.
3. Also provide a "rootLiteratureQuery": A targeted 2-4 word query to find foundational literature for the main hypothesis on Semantic Scholar.

Return strictly a valid JSON object matching this schema:
{
  "rootLiteratureQuery": "...",
  "subHypotheses": [
    {
      "title": "...",
      "lens": "...",
      "rationale": "...",
      "confidence": 0.85,
      "literatureQuery": "...",
      "experiments": [
        {
          "title": "...",
          "goal": "...",
          "steps": ["Step 1", "Step 2", "Step 3"],
          "expectedResult": "...",
          "rationale": "...",
          "confidence": 0.80
        }
      ]
    }
  ]
}

Keep rationale, goals, and protocol steps concise, dense, and high-signal (1-2 sentences each) so that the entire tree is generated cleanly without truncation.`;

  const response = await client.messages.create({
    model,
    max_tokens: 6000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Central Scientific Hypothesis to decompose and validate:\n"${mainHypothesis.trim()}"`,
      },
    ],
  });

  const rawText = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as Anthropic.TextBlock).text)
    .join("\n");

  let jsonString = rawText.trim();
  const jsonBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    jsonString = jsonBlockMatch[1].trim();
  } else {
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = rawText.slice(firstBrace, lastBrace + 1);
    }
  }

  let parsed: GeneratedTreeStructure;
  try {
    parsed = JSON.parse(jsonString) as GeneratedTreeStructure;
  } catch (err) {
    throw new Error(
      `Failed to parse Claude tree generation response (${err instanceof Error ? err.message : String(err)}): ${rawText.slice(0, 300)}...`,
    );
  }

  // Search Semantic Scholar for root literature
  const rootQuery = parsed.rootLiteratureQuery || mainHypothesis.slice(0, 60);
  let rootEvidence: Evidence[] = [];
  try {
    const rootResult = await searchSemanticScholar(rootQuery, 3);
    rootEvidence = (rootResult.papers || []).map((p) => ({
      text: p.abstract ? `${p.abstract.slice(0, 240)}…` : p.title,
      citation: formatCitation(p.authors, p.year, p.venue),
      url: p.url || undefined,
      year: p.year || undefined,
      paperId: p.paperId,
    }));
  } catch (e) {
    console.warn("Could not fetch root papers from Semantic Scholar:", e);
  }

  const nodes: TreeNode[] = [
    {
      id: "root",
      parentId: null,
      kind: "root",
      status: "untested",
      title: mainHypothesis.trim(),
      evidence: rootEvidence,
    },
  ];

  // For each sub-hypothesis, search Semantic Scholar and assemble nodes
  for (let hIdx = 0; hIdx < (parsed.subHypotheses || []).length; hIdx++) {
    const sub = parsed.subHypotheses[hIdx];
    const subId = `h${hIdx + 1}`;
    let subEvidence: Evidence[] = [];

    try {
      const subQuery = sub.literatureQuery || sub.title.slice(0, 60);
      const subResult = await searchSemanticScholar(subQuery, 2);
      subEvidence = (subResult.papers || []).map((p) => ({
        text: p.abstract ? `${p.abstract.slice(0, 240)}…` : p.title,
        citation: formatCitation(p.authors, p.year, p.venue),
        url: p.url || undefined,
        year: p.year || undefined,
        paperId: p.paperId,
      }));
    } catch (e) {
      console.warn(`Could not fetch papers for sub-hypothesis ${subId}:`, e);
    }

    nodes.push({
      id: subId,
      parentId: "root",
      kind: "hypothesis",
      status: "untested",
      title: sub.title,
      rationale: sub.rationale,
      lens: sub.lens,
      confidence: sub.confidence ?? 0.8,
      evidence: subEvidence,
    });

    for (let eIdx = 0; eIdx < (sub.experiments || []).length; eIdx++) {
      const exp = sub.experiments[eIdx];
      const expId = `e${hIdx + 1}${String.fromCharCode(97 + eIdx)}`;
      nodes.push({
        id: expId,
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
      });
    }
  }

  return nodes;
}
