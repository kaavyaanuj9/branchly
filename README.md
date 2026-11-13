# HypoTree

A tree-shaped workspace where a scientist and AI assistants test a hypothesis together.
This is the front end only. AI replies are **simulated** (no paid APIs yet).

## Run it

```bash
cd hypotree-app
npm run dev
```

Then open http://localhost:3000. Stop the server with `Ctrl + C`.

## Where things live

| File | What it does |
| --- | --- |
| `src/lib/sampleData.ts` | The sample Venetoclax / BCL-2 hypotheses. Edit this to change the starting tree. |
| `src/lib/types.ts` | The shape of a box (idea, experiment, suggestion) and chat messages. |
| `src/lib/store.tsx` | All app data and the actions that change it; saves to your browser. |
| `src/lib/mockAgent.ts` | The pretend AI. Replace these functions with real AI calls later. |
| `src/lib/tree.ts` | Tree helpers and the layout that positions the boxes. |
| `src/components/HypoTreeApp.tsx` | The full screen: header, toolbar, canvas, panels. |
| `src/components/TreeCanvas.tsx` | The zoomable tree (React Flow). |
| `src/components/HypoNode.tsx` | How each box looks. |
| `src/components/DetailPanel.tsx` | The middle panel with a box's details. |
| `src/components/ChatPanel.tsx` | The per-box AI assistant. |
| `src/components/Modals.tsx` | Pop-ups: add/edit, upload results, help. |

To start over with the sample data, open the **?** help menu and click **Reset demo project**.
