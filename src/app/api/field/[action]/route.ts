import { NextResponse } from "next/server";
import * as rt from "@/lib/researchTree";

// The "Field" panel's server side: forwards to Research Tree (the field-scale literature
// map) so the browser only ever talks to Branchly.
//
//   GET  /api/field/status
//   GET  /api/field/tree                    the whole field map (branches, topics, stats)
//   GET  /api/field/topic?id=...            one branch/topic: papers, neighbours, landmarks
//   GET  /api/field/locate?q=...            where an idea sits, novelty, closest papers
//   GET  /api/field/reading?q=...           reading list from the citation lineage
//   GET  /api/field/aspects?problem=&method=&setting=   has this combination been done?
//   GET  /api/field/watch?token=...         matches for an alert
//   GET  /api/field/lineage?node=|paper=    citation lineage (s cites t)
//   GET  /api/field/paper?id=...            one paper with abstract and place on the map
//   GET  /api/field/events                  live stream: new papers, signals, rebuilds (SSE)
//   POST /api/field/watch {query}|{node}    create an alert for an idea or a topic
//   POST /api/field/unwatch {token}         stop an alert
//   POST /api/field/signal {node, kind, who, text, visibility}   claim / promising / dead end / note

function fail(error: unknown) {
  const unavailable = error instanceof rt.ResearchTreeUnavailable;
  const msg = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: msg, unavailable }, { status: unavailable ? 503 : 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const q = new URL(request.url).searchParams;
  try {
    switch (action) {
      case "status":
        return NextResponse.json({ ...(await rt.status()), mapUrl: rt.fieldUrl() });
      case "tree":
        return NextResponse.json(await rt.tree());
      case "topic": {
        const id = q.get("id");
        if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
        return NextResponse.json(await rt.topic(id));
      }
      case "locate": {
        const text = q.get("q")?.trim();
        if (!text) return NextResponse.json({ error: "missing q" }, { status: 400 });
        return NextResponse.json({ ...(await rt.locate(text)), mapUrl: rt.fieldUrl(text) });
      }
      case "reading": {
        const text = q.get("q")?.trim();
        if (!text) return NextResponse.json({ error: "missing q" }, { status: 400 });
        return NextResponse.json(await rt.readingList(text));
      }
      case "aspects":
        return NextResponse.json(
          await rt.aspects({
            problem: q.get("problem") || "",
            method: q.get("method") || "",
            setting: q.get("setting") || "",
          }),
        );
      case "lineage": {
        const node = q.get("node"), paper = q.get("paper");
        if (!node && !paper) return NextResponse.json({ error: "missing node or paper" }, { status: 400 });
        return NextResponse.json(await rt.lineage(node ? "node" : "paper", (node || paper)!));
      }
      case "paper": {
        const id = q.get("id");
        if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
        return NextResponse.json(await rt.paper(id));
      }
      case "events": {
        const up = await rt.events(request.signal);
        if (!up.ok || !up.body) return NextResponse.json({ error: "no event stream" }, { status: 502 });
        return new Response(up.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
        });
      }
      case "watch": {
        const token = q.get("token");
        if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });
        return NextResponse.json(await rt.viewWatch(token));
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 404 });
    }
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, string | undefined>;
    switch (action) {
      case "watch": {
        const { query, node, label } = body;
        if (!query?.trim() && !node) return NextResponse.json({ error: "missing query or node" }, { status: 400 });
        return NextResponse.json(await rt.createWatch({ query: query?.trim(), node, label }));
      }
      case "unwatch":
        if (!body.token) return NextResponse.json({ error: "missing token" }, { status: 400 });
        return NextResponse.json(await rt.stopWatch(body.token));
      case "signal": {
        const { node, kind, who, text, visibility } = body;
        if (!node || !kind) return NextResponse.json({ error: "missing node or kind" }, { status: 400 });
        return NextResponse.json(await rt.signal(node, { kind, who, text, visibility, actor: "human" }));
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 404 });
    }
  } catch (error) {
    return fail(error);
  }
}
