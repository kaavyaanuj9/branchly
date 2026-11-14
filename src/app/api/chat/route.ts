import { NextResponse } from "next/server";
import { chatWithNodeAgent } from "@/lib/claude";
import type { TreeNode } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { node, parent, children, history, question } = body as {
      node: TreeNode;
      parent?: TreeNode;
      children?: TreeNode[];
      history?: { role: "user" | "assistant"; content: string }[];
      question: string;
    };

    if (!node || !question) {
      return NextResponse.json(
        { error: "Node details and question are required." },
        { status: 400 },
      );
    }

    const reply = await chatWithNodeAgent({
      node,
      parent,
      children: children || [],
      history: history || [],
      question,
    });

    return NextResponse.json(reply);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

