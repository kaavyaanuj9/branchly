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

## 🔐 Set up Google sign-in (Firebase)

Every page and API route requires signing in with Google. Signed-out visitors are sent to `/login`, and API calls get a `401`.

1. In the [Firebase console](https://console.firebase.google.com), open your project and enable **Authentication → Sign-in method → Google**.
2. Under **Authentication → Settings → Authorized domains**, make sure your production domain is listed (`localhost` is there by default).
3. **Project settings → General → Your apps**: add a web app and copy its config into `.env.local`:
   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project>
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```
4. **Project settings → Service accounts → Generate new private key**, then copy these fields from the downloaded JSON (keep this secret, never commit it):
   ```bash
   FIREBASE_PROJECT_ID=<project_id>
   FIREBASE_CLIENT_EMAIL=<client_email>
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

How it works: the login page runs Google sign-in with the Firebase web SDK, then posts the ID token to `/api/auth/session`. The server verifies it with `firebase-admin` and sets a 5-day httpOnly `__session` cookie, which `src/proxy.ts` checks on every request.

---

## 🗄️ Set up Firestore (teams and shared trees)

Trees, research teams and invites are stored in Cloud Firestore, so teammates can edit the same tree live. This fits Firebase's free Spark plan.

1. Firebase console → **Firestore Database → Create database**. Pick production mode and the region nearest your users.
2. Publish the security rules in [`firestore.rules`](firestore.rules). Either paste them into the console's **Firestore → Rules** tab and click **Publish**, or run:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules
   ```
   The rules are what stop viewers from editing and non-members from reading a team's trees, so redeploy them whenever `firestore.rules` changes.

No extra env vars are needed: the Firebase Admin credentials above also cover Firestore.

---

## 🚀 Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔬 Key Features

1. **Research teams**:
   - Every user has a **Personal** space. Create a team from the home page to collaborate.
   - Owners invite people by the Google email they sign in with. Only people who've signed in to HypoTree at least once can be invited, and they accept or decline under **Team invites** (inbox icon in the header).
   - Roles: **Owner** manages members and can delete the team, **Editor** edits trees, **Viewer** can read and chat with the AI but not change the tree.
   - Everyone on a team sees edits to a tree within about a second.

2. **Semantic Scholar Literature Search**:
   - Click **Search Literature** in the toolbar or **Search Semantic Scholar for papers** in any node's Evidence panel.
   - Read abstracts, TLDRs, citation counts, and click direct paper links.
   - Click **Add to Evidence** to link the publication directly to your hypothesis.
   - Click **Analyze with Claude** to assess whether the paper supports or challenges the claim.

3. **Claude Sonnet 5.5 AI Co-Investigators**:
   - Each node has a dedicated agent (Literature Agent, Validator Agent, Experiment Agent, Explorer Agent).
   - Chat in real-time about protocols, controls, and boundary conditions.
   - Claude generates structured proposal cards (**Approve & add to tree**) that insert sub-hypotheses or experiments directly into the canvas.

4. **Break Down with Claude**:
   - Select any hypothesis and click **Break Down (Claude)** in the toolbar or detail panel.
   - Claude formulates 3 testable sub-claims and experiments through different scientific lenses (*"What must be true"*, *"When might it not hold"*, *"Direct mechanism"*).

5. **Experiment Result Interpretation**:
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
| `src/lib/store.tsx` | One tree's state. Applies actions locally, writes changed nodes and messages to Firestore, and listens for teammates' edits. |
| `src/lib/teams.ts` | Live Firestore hooks for teams, trees and invites, plus tree create/rename and the one-time import of a browser-saved tree. |
| `src/app/api/teams/`, `src/app/api/invitations/` | Server routes for membership: create/rename/delete teams, invite, accept/decline, change roles, remove members, delete trees. |
| `src/components/teams/` | Teams home, team page (trees + members + invites) and the invite inbox. |
| `firestore.rules` | Who can read and write what in Firestore. |
| `src/proxy.ts` | Gates every page and API route on a valid Firebase session cookie. |
| `src/lib/firebase/admin.ts` | Server-only Firebase Admin setup and session-cookie verification. |
| `src/lib/firebase/client.ts` | Browser Firebase setup used for the Google sign-in popup. |
| `src/app/login/` | Login page with the "Sign in with Google" button. |
| `src/app/api/auth/session/route.ts` | Exchanges a fresh Google sign-in for the session cookie. |
| `src/app/auth/signout/route.ts` | Clears the session cookie. |
| `src/lib/types.ts` | TypeScript types for tree nodes, evidence, papers, and proposals. |
