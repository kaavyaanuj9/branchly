import { NextResponse } from "next/server";
import { decomposeHypothesisWithClaude } from "@/lib/claude";
import type { TreeNode } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { node, parent } = body as {
      node: TreeNode;
      parent?: TreeNode;
    };

    if (!node) {
      return NextResponse.json({ error: "Node details are required." }, { status: 400 });
    }

    const result = await decomposeHypothesisWithClaude({ node, parent });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

