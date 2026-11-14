import { NextResponse } from "next/server";
import { generateFullHypothesisTree } from "@/lib/claude";

// POST /api/trees/generate {title} -> {title, nodes}: a complete tree for a main hypothesis
// (sub-hypotheses, planned experiments, and papers), as on the team's main branch.
export async function POST(request: Request) {
  try {
    const { title } = (await request.json()) as { title?: string };
    if (!title?.trim()) return NextResponse.json({ error: "A main hypothesis statement is required." }, { status: 400 });
    const nodes = await generateFullHypothesisTree(title.trim());
    return NextResponse.json({ title: title.trim(), nodes });
  } catch (error) {
    console.error("Tree generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate hypothesis tree." },
      { status: 500 },
    );
  }
}
