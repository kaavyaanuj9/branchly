import { NextResponse } from "next/server";
import { analyzePaperImpactWithClaude } from "@/lib/claude";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paperTitle, abstract, tldr, citation, nodeTitle } = body as {
      paperTitle: string;
      abstract?: string | null;
      tldr?: string | null;
      citation: string;
      nodeTitle: string;
    };

    if (!paperTitle || !citation || !nodeTitle) {
      return NextResponse.json(
        { error: "paperTitle, citation, and nodeTitle are required." },
        { status: 400 },
      );
    }

    const data = await analyzePaperImpactWithClaude({
      paperTitle,
      abstract,
      tldr,
      citation,
      nodeTitle,
    });

    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

