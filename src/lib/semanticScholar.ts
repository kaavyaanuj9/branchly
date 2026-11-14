import type { SemanticScholarPaper } from "./types";

const S2_API_URL = "https://api.semanticscholar.org/graph/v1/paper/search";

export interface SemanticScholarSearchResult {
  total: number;
  offset: number;
  next?: number;
  data: SemanticScholarPaper[];
}

export function formatCitation(
  authors: { authorId?: string; name: string }[] | undefined,
  year?: number | null,
  venue?: string | null,
): string {
  let authorStr = "Unknown Authors";
  if (authors && authors.length > 0) {
    if (authors.length === 1) {
      authorStr = authors[0].name;
    } else if (authors.length === 2) {
      authorStr = `${authors[0].name} & ${authors[1].name}`;
    } else {
      authorStr = `${authors[0].name} et al.`;
    }
  }

  const parts = [authorStr];
  if (year) parts.push(String(year));
  if (venue && venue.trim()) parts.push(venue.trim());

  return parts.join(", ");
}

/**
 * Searches the Semantic Scholar Academic Graph API for relevant research papers.
 * No placeholder or fallback data is used. Throws descriptive errors if rate limited or unconfigured.
 */
export async function searchSemanticScholar(
  query: string,
  limit = 8,
): Promise<{ papers: SemanticScholarPaper[]; total: number }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error("Search query cannot be empty.");
  }

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();
  const fields = [
    "paperId",
    "title",
    "abstract",
    "authors",
    "year",
    "citationCount",
    "url",
    "venue",
    "tldr",
    "openAccessPdf",
  ].join(",");

  const url = `${S2_API_URL}?query=${encodeURIComponent(cleanQuery)}&limit=${limit}&fields=${fields}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "HypoTree-Scientific-Workspace/1.0 (academic-research)",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  // A key allows 1 request/second shared across everything using it (e.g. the Research Tree
  // build), so a 429 is often momentary: retry a few times with growing pauses.
  let res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  for (const waitMs of [1500, 3000, 6000]) {
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, waitMs));
    res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  }

  if (!res.ok) {
    let errorMsg = `Semantic Scholar API request failed (${res.status} ${res.statusText})`;
    try {
      const errJson = await res.json();
      if (errJson.message) errorMsg = errJson.message;
    } catch {
      // ignore json parse error
    }

    if (res.status === 429) {
      throw new Error(
        `Semantic Scholar rate limit reached (HTTP 429). ${
          apiKey
            ? "Your API key quota may have been exceeded."
            : "Please add SEMANTIC_SCHOLAR_API_KEY to your .env.local file for higher rate limits (get one at https://www.semanticscholar.org/product/api#api-key-form)."
        }`,
      );
    }

    throw new Error(`Semantic Scholar error: ${errorMsg}`);
  }

  const data = (await res.json()) as SemanticScholarSearchResult;
  return {
    papers: data.data || [],
    total: data.total || (data.data ? data.data.length : 0),
  };
}

