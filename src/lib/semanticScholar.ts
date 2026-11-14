import type { SemanticScholarPaper } from "./types";

const S2_BULK_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search/bulk";

// In-memory cache to prevent redundant network calls and guarantee fast responses
const searchCache = new Map<string, { papers: SemanticScholarPaper[]; total: number; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
 * Searches Semantic Scholar using the official unauthenticated bulk search API.
 * No API key is required.
 * Includes in-memory caching and automatic retry with backoff.
 */
export async function searchSemanticScholar(
  query: string,
  limit = 8,
): Promise<{ papers: SemanticScholarPaper[]; total: number }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error("Search query cannot be empty.");
  }

  const cacheKey = `${cleanQuery.toLowerCase()}::${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { papers: cached.papers, total: cached.total };
  }

  const fields = [
    "paperId",
    "title",
    "abstract",
    "authors",
    "year",
    "citationCount",
    "url",
    "venue",
    "openAccessPdf",
  ].join(",");

  const url = `${S2_BULK_SEARCH_URL}?query=${encodeURIComponent(cleanQuery)}&sort=citationCount:desc&fields=${fields}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "HypoTree-Scientific-Workspace/1.0 (academic-research)",
  };

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim();
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  // If an API key is provided, prefer the dedicated relevance search endpoint with fallback to bulk
  const candidateUrls = apiKey
    ? [
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(cleanQuery)}&limit=${limit}&fields=${fields}`,
        url,
      ]
    : [url];

  const maxAttempts = 2;
  let lastError: Error | null = null;

  for (const targetUrl of candidateUrls) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers,
          cache: "no-store",
        });

        if (res.status === 429 && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        if (!res.ok) {
          // If this endpoint failed and we have another candidate, break to next candidate
          if (candidateUrls.length > 1 && targetUrl !== url) {
            break;
          }
          let errorMsg = `Semantic Scholar request failed (${res.status} ${res.statusText})`;
          try {
            const errJson = await res.json();
            if (errJson.message) errorMsg = errJson.message;
            if (errJson.error) errorMsg = errJson.error;
          } catch {
            // ignore
          }
          throw new Error(errorMsg);
        }

        const data = await res.json();
        const allPapers: SemanticScholarPaper[] = data.data || [];
        const slicedPapers = allPapers.slice(0, limit);
        const total = data.total || allPapers.length;

        const result = {
          papers: slicedPapers,
          total,
        };

        searchCache.set(cacheKey, { ...result, timestamp: Date.now() });
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
    }
  }

  throw lastError || new Error("Failed to retrieve papers from Semantic Scholar.");
}
