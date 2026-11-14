# HypoTree

A tree-shaped workspace where scientists and AI assistants test hypotheses together.

Powered by:
- **Claude Sonnet 5.5** (via the Anthropic API or your Claude Code login) for real-time scientific reasoning, hypothesis decomposition, experimental protocol critique, and result interpretation.
- **Semantic Scholar API** for live research paper retrieval, citation tracking, and literature-backed evidence linking.

---

## 🔑 Configure API Keys

1. Copy `.env.example` to `.env.local` (or edit the created `.env.local` file):
   ```bash
   cp .env.example .env.local
   ```

2. Add your keys in `.env.local`:
   ```bash
   # Required: Anthropic API Key for Claude Sonnet 5.5
   ANTHROPIC_API_KEY=sk-ant-api03-...

   # Optional (defaults to claude-sonnet-5.5)
   ANTHROPIC_MODEL=claude-sonnet-5.5

   # Recommended: Semantic Scholar API Key for literature searching
   SEMANTIC_SCHOLAR_API_KEY=your_key_here
   ```
   - **Anthropic Key**: Get one at [console.anthropic.com](https://console.anthropic.com/).
   - **Semantic Scholar Key**: Request one at [semanticscholar.org/product/api](https://www.semanticscholar.org/product/api#api-key-form) for high rate limits (unauthenticated public requests have strict rate limits).

---

## 🚀 Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔬 Key Features

1. **Semantic Scholar Literature Search**:
   - Click **Search Literature** in the toolbar or **Search Semantic Scholar for papers** in any node's Evidence panel.
   - Read abstracts, TLDRs, citation counts, and click direct paper links.
   - Click **Add to Evidence** to link the publication directly to your hypothesis.
   - Click **Analyze with Claude** to assess whether the paper supports or challenges the claim.

2. **Claude Sonnet 5.5 AI Co-Investigators**:
   - Each node has a dedicated agent (Literature Agent, Validator Agent, Experiment Agent, Explorer Agent).
   - Chat in real-time about protocols, controls, and boundary conditions.
   - Claude generates structured proposal cards (**Approve & add to tree**) that insert sub-hypotheses or experiments directly into the canvas.

3. **Break Down with Claude**:
   - Select any hypothesis and click **Break Down (Claude)** in the toolbar or detail panel.
   - Claude formulates 3 testable sub-claims and experiments through different scientific lenses (*"What must be true"*, *"When might it not hold"*, *"Direct mechanism"*).

4. **Experiment Result Interpretation**:
   - Upload experimental findings and designate the outcome (*As expected*, *Unexpected / Contradicted*, *Unclear*).
   - Claude interprets the results against prior expectations.
   - If contradicted, Claude formulates 3 distinct, creative alternative hypotheses with follow-up experiments to explain the unexpected finding.

---

## 🌳 Research Tree: the field around your hypothesis

HypoTree is project scale: one team testing one idea. **Research Tree** (`research-tree/`) is field
scale: a live map of what every lab is publishing, who builds on whom, and which directions are
crowded or open. It runs as its own service, and HypoTree uses it as its literature layer.

- **In the field** panel on every box:
  - **Where it sits:** the box's place on the field map, how crowded it is, and the closest papers
    (each with **+ Evidence**).
  - **Tested?:** has this problem + method (+ setting) been done? Matches are confirmed sentence by
    sentence and quoted.
  - **Read:** a reading list from the citation lineage (foundations, closest work, newest).
  - **Watch:** an alert that collects new preprints which directly address the box.
- **Grounded AI:** each box's agent and **Break Down** get the closest real papers and cite them
  as [n]. They say so when none of them apply, instead of inventing citations.

Run the cancer & cell biology map (bioRxiv preprints + the published papers they cite):

```bash
cd research-tree
RT_FIELD=cancer_cell_bio python3 server.py     # http://127.0.0.1:8766
```

First-time build of its data: see `research-tree/README.md` ("Fields"). Set `RESEARCH_TREE_URL` in
`.env.local` if it runs elsewhere. Without it, HypoTree still works; the panel says the map is unreachable.

## 🤖 AI backend: API key or your Claude Code login

`src/lib/llm.ts` sends every AI request through one helper:

- **Anthropic API:** used when `ANTHROPIC_API_KEY` is set.
- **Your Claude Code login:** used otherwise. It runs `claude -p` headless with tools, MCP servers and
  saved sessions off, in an empty temp folder. It's meant for personal local use; use an API key for
  anything shared or deployed.

Force one with `AI_BACKEND=api` or `AI_BACKEND=claude-code`.

## 📁 Where things live

| File | What it does |
| --- | --- |
| `src/lib/claude.ts` | Prompts and proposal parsing for chat, decomposition, result interpretation and paper analysis. |
| `src/lib/llm.ts` | The AI backend: Anthropic API or your Claude Code login. |
| `src/lib/researchTree.ts` | Client for the Research Tree field map (locate, reading list, combination check, alerts). |
| `src/app/api/field/[action]/route.ts` | Server routes behind the **In the field** panel. |
| `src/components/FieldPanel.tsx` | The **In the field** panel on each box. |
| `research-tree/` | The field-scale literature map (Python service). |
| `src/lib/semanticScholar.ts` | Semantic Scholar Academic Graph API search and citation formatting. |
| `src/app/api/chat/route.ts` | Route handler for node-scoped Claude conversation. |
| `src/app/api/interpret-result/route.ts` | Route handler for Claude experimental result interpretation & alternative generation. |
| `src/app/api/decompose/route.ts` | Route handler for Claude hypothesis decomposition. |
| `src/app/api/papers/search/route.ts` | Route handler querying Semantic Scholar API. |
| `src/app/api/papers/analyze/route.ts` | Route handler using Claude to evaluate literature impact. |
| `src/components/PaperSearchModal.tsx` | Research paper search modal with direct evidence linking & AI analysis. |
| `src/components/DecomposeModal.tsx` | Claude hypothesis decomposition modal. |
| `src/components/HypoTreeApp.tsx` | Full-screen app layout, header, toolbar, canvas, and panels. |
| `src/components/TreeCanvas.tsx` | Interactive React Flow canvas with confidence-weighted edges. |
| `src/components/DetailPanel.tsx` | Selected node inspection, protocols, results, and evidence curation. |
| `src/components/ChatPanel.tsx` | Per-node conversational co-investigator with Claude Sonnet 5.5. |
| `src/lib/store.tsx` | Unified React store and `localStorage` persistence. |
| `src/lib/types.ts` | TypeScript types for tree nodes, evidence, papers, and proposals. |
