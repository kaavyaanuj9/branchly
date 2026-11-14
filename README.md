# HypoTree

A tree-shaped workspace where scientists and AI assistants test hypotheses together.

Powered by:
- **Claude Sonnet 5.5** via the Anthropic API for real-time scientific reasoning, hypothesis decomposition, experimental protocol critique, and result interpretation.
- **Semantic Scholar API** for live research paper retrieval, citation tracking, and literature-backed evidence linking.

---

## 🔑 Configure API Keys

1. Copy `.env.example` to `.env.local` (or edit the created `.env.local` file):
   ```bash
   cp .env.example .env.local
   ```

2. Add your Anthropic API key in `.env.local`:
   ```bash
   # Required: Anthropic API Key for Claude Sonnet 5.5
   ANTHROPIC_API_KEY=sk-ant-api03-...

   # Optional: Model name (defaults to claude-sonnet-5.5)
   ANTHROPIC_MODEL=claude-sonnet-5.5
   ```
   - **Anthropic Key**: Get one at [console.anthropic.com](https://console.anthropic.com/).
   - **Semantic Scholar API**: **No API key is needed!** Research paper searching runs unauthenticated out of the box via Semantic Scholar's academic graph bulk search API.

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

## 📁 Where things live

| File | What it does |
| --- | --- |
| `src/lib/claude.ts` | Server-side Claude Sonnet 5.5 client, prompt engineering, and proposal parsing. |
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
