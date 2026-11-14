import { NextResponse } from "next/server";
import { generateFullHypothesisTree } from "@/lib/claude";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title } = body as { title: string };

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "A main hypothesis statement is required." },
        { status: 400 },
      );
    }

    const nodes = await generateFullHypothesisTree(title.trim());
    return NextResponse.json({ title: title.trim(), nodes });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to generate hypothesis tree.";
    console.error("Tree generation error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

