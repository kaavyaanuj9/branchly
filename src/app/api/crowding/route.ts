import { NextResponse } from "next/server";
import { assessCrowdingWithClaude } from "@/lib/claude";

// POST /api/crowding {title, context?, papers: [{title, abstract, citation}]}
// -> {verdict: answered | partly | open, summary, gap, options: [{title, why}]}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Parameters<typeof assessCrowdingWithClaude>[0];
    if (!body?.title?.trim() || !body.papers?.length)
      return NextResponse.json({ error: "A hypothesis and its closest papers are required." }, { status: 400 });
    return NextResponse.json(await assessCrowdingWithClaude(body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
