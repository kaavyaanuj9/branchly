import { NextResponse } from "next/server";
import * as rt from "@/lib/researchTree";

// The "Field" panel's server side: forwards to Research Tree (the field-scale literature
// map) so the browser only ever talks to HypoTree.
//
//   GET  /api/field/status
//   GET  /api/field/tree                    the whole field map (branches, topics, stats)
//   GET  /api/field/topic?id=...            one branch/topic: papers, neighbours, landmarks
//   GET  /api/field/locate?q=...            where an idea sits, novelty, closest papers
//   GET  /api/field/reading?q=...           reading list from the citation lineage
//   GET  /api/field/aspects?problem=&method=&setting=   has this combination been done?
//   GET  /api/field/watch?token=...         matches for an alert
//   POST /api/field/watch {query}           create an alert for an idea

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
  if (action !== "watch") return NextResponse.json({ error: "unknown action" }, { status: 404 });
  try {
    const { query } = (await request.json()) as { query?: string };
    if (!query?.trim()) return NextResponse.json({ error: "missing query" }, { status: 400 });
    return NextResponse.json(await rt.createWatch(query.trim()));
  } catch (error) {
    return fail(error);
  }
}
