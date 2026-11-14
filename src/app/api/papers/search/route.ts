import { NextResponse } from "next/server";
import { searchSemanticScholar } from "@/lib/semanticScholar";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "";
    const limit = parseInt(searchParams.get("limit") || "8", 10);

    if (!query.trim()) {
      return NextResponse.json({ error: "Query parameter is required." }, { status: 400 });
    }

    const data = await searchSemanticScholar(query, limit);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const query = (body.query as string) || "";
    const limit = (body.limit as number) || 8;

    if (!query.trim()) {
      return NextResponse.json({ error: "Query parameter is required." }, { status: 400 });
    }

    const data = await searchSemanticScholar(query, limit);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "An unexpected error occurred.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

