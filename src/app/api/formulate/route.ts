import { NextResponse } from "next/server";
import { formulateIdeaWithClaude } from "@/lib/claude";

// POST /api/formulate {messages: [{role: "user"|"assistant", content}]} -> a testable hypothesis
export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages?: { role: "user" | "assistant"; content: string }[] };
    if (!messages?.length) return NextResponse.json({ error: "Describe your idea first." }, { status: 400 });
    return NextResponse.json(await formulateIdeaWithClaude(messages.slice(-12)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
