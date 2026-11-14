import { NextResponse } from "next/server";
import { interpretExperimentResultWithClaude } from "@/lib/claude";
import type { TreeNode } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { experiment, hypothesis, notes, outcome } = body as {
      experiment: TreeNode;
      hypothesis: TreeNode;
      notes: string;
      outcome: "supported" | "contradicted" | "inconclusive";
    };

    if (!experiment || !hypothesis || !notes || !outcome) {
      return NextResponse.json(
        { error: "Experiment, hypothesis, notes, and outcome are all required." },
        { status: 400 },
      );
    }

    const result = await interpretExperimentResultWithClaude({
      experiment,
      hypothesis,
      notes,
      outcome,
    });

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

