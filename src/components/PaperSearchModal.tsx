"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { findNode } from "@/lib/tree";
import { keywordQuery } from "@/lib/keywords";
import type { Evidence, SemanticScholarPaper } from "@/lib/types";
import { formatCitation } from "@/lib/semanticScholar";

export function PaperSearchModal({
  nodeId,
  onClose,
}: {
  nodeId?: string;
  onClose: () => void;
}) {
  const { state, dispatch } = useStore();
  const targetNode = findNode(state.nodes, nodeId || state.selectedId || "root");

  // Generate an initial query from the node title (removing stopwords / punctuation)
  const initialQuery = targetNode ? keywordQuery(targetNode.title) : "Venetoclax BCL-2";

  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [papers, setPapers] = useState<SemanticScholarPaper[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Claude analysis state per paper
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<
    Record<
      string,
      {
        supportsHypothesis: boolean | null;
        summary: string;
        evidenceExtract: string;
      }
    >
  >({});

  async function search(searchQuery: string) {
    const q = searchQuery.trim();
    if (!q) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/papers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: 10 }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to search Semantic Scholar.");
      }

      setPapers(data.papers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPapers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    fetch("/api/papers/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: initialQuery, limit: 10 }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to search Semantic Scholar.");
        if (!ignore) {
          setPapers(data.papers || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : String(err));
          setPapers([]);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [initialQuery]);

  async function analyzeWithClaude(paper: SemanticScholarPaper) {
    if (!targetNode) return;
    setAnalyzingId(paper.paperId);

    try {
      const citation = formatCitation(paper.authors, paper.year, paper.venue);
      const res = await fetch("/api/papers/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperTitle: paper.title,
          abstract: paper.abstract,
          tldr: paper.tldr?.text,
          citation,
          nodeTitle: targetNode.title,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to analyze paper with Claude.");
      }

      setAnalyses((prev) => ({
        ...prev,
        [paper.paperId]: data,
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error analyzing paper with Claude.");
    } finally {
      setAnalyzingId(null);
    }
  }

  function addPaperToEvidence(
    paper: SemanticScholarPaper,
    customExtract?: string,
  ) {
    if (!targetNode) return;
    const citation = formatCitation(paper.authors, paper.year, paper.venue);
    const text =
      customExtract ||
      paper.tldr?.text ||
      paper.abstract?.slice(0, 220) ||
      paper.title;

    const evidence: Evidence = {
      text,
      citation,
      url: paper.url || undefined,
      year: paper.year || undefined,
      paperId: paper.paperId,
      tldr: paper.tldr?.text,
    };

    dispatch({
      type: "addEvidence",
      id: targetNode.id,
      evidence,
    });

    setAddedIds((prev) => new Set([...prev, paper.paperId]));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-900/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-900">
              <BookOpen className="size-4.5" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-900">
                Semantic Scholar Literature Search
              </h2>
              {targetNode && (
                <p className="line-clamp-1 text-xs text-neutral-500">
                  Target: <span className="font-medium text-neutral-700">{targetNode.title}</span>
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="border-b border-neutral-100 bg-neutral-50/70 px-6 py-3.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search(query);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-neutral-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search research papers on Semantic Scholar…"
                className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-neutral-800 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-900 disabled:bg-neutral-300"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Search
            </button>
          </form>
        </div>

        {/* Results Container */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 size-4.5 shrink-0 text-rose-600" />
                <div className="space-y-1">
                  <p className="font-semibold">Semantic Scholar Error</p>
                  <p className="text-[13px] leading-relaxed text-rose-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
              <Loader2 className="mb-2 size-8 animate-spin text-neutral-900" />
              <p className="text-sm font-medium">Querying Semantic Scholar Academic Graph…</p>
            </div>
          )}

          {!loading && !error && papers.length === 0 && (
            <div className="py-12 text-center text-neutral-500">
              <p className="text-sm font-medium">No papers found for this query.</p>
              <p className="mt-1 text-xs text-neutral-400">
                Try searching for specific genes, disease subtypes, or drug mechanisms.
              </p>
            </div>
          )}

          {!loading &&
            papers.map((p) => {
              const citation = formatCitation(p.authors, p.year, p.venue);
              const isAdded = addedIds.has(p.paperId);
              const analysis = analyses[p.paperId];
              const isAnalyzing = analyzingId === p.paperId;

              return (
                <div
                  key={p.paperId}
                  className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-[14.5px] font-semibold leading-snug text-neutral-900">
                        {p.url ? (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-neutral-900 hover:underline"
                          >
                            {p.title}
                            <ExternalLink className="size-3 text-neutral-400" />
                          </a>
                        ) : (
                          p.title
                        )}
                      </h3>
                      <p className="text-xs text-neutral-500">{citation}</p>
                    </div>

                    {p.citationCount !== undefined && p.citationCount !== null && (
                      <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-[11px] font-medium text-neutral-600">
                        {p.citationCount} {p.citationCount === 1 ? "citation" : "citations"}
                      </span>
                    )}
                  </div>

                  {/* TLDR */}
                  {p.tldr?.text && (
                    <div className="mt-2.5 rounded-lg border border-neutral-100 bg-neutral-100/40 px-3 py-2 text-[12.5px] leading-relaxed text-neutral-700">
                      <span className="font-semibold text-neutral-900">TLDR: </span>
                      {p.tldr.text}
                    </div>
                  )}

                  {/* Abstract */}
                  {p.abstract && !p.tldr?.text && (
                    <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-neutral-600">
                      {p.abstract}
                    </p>
                  )}

                  {/* Claude Analysis Output */}
                  {analysis && (
                    <div className="mt-3 space-y-2 rounded-xl border border-neutral-300 bg-neutral-100/50 p-3.5 text-xs text-neutral-800">
                      <div className="flex items-center gap-1.5 font-semibold text-neutral-900">
                        <Sparkles className="size-3.5" />
                        Claude Sonnet 5.5 Relevance Assessment:
                        {analysis.supportsHypothesis === true && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                            Supports Hypothesis
                          </span>
                        )}
                        {analysis.supportsHypothesis === false && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800">
                            Challenges / Contradicts
                          </span>
                        )}
                      </div>
                      <p className="leading-relaxed text-neutral-700">{analysis.summary}</p>
                      <div className="border-t border-neutral-300/60 pt-2">
                        <span className="font-medium text-neutral-900">Recommended Evidence Extract: </span>
                        <span className="italic text-neutral-700">&ldquo;{analysis.evidenceExtract}&rdquo;</span>
                      </div>
                      <button
                        onClick={() => addPaperToEvidence(p, analysis.evidenceExtract)}
                        disabled={isAdded}
                        className="mt-1 flex items-center gap-1 rounded-md bg-neutral-900 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-neutral-900 disabled:bg-neutral-300"
                      >
                        <Check className="size-3" />
                        {isAdded ? "Added to Evidence" : "Save Extracted Evidence to Node"}
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2.5">
                    <button
                      onClick={() => addPaperToEvidence(p)}
                      disabled={isAdded || !targetNode}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        isAdded
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "bg-neutral-900 text-white hover:bg-neutral-800"
                      }`}
                    >
                      {isAdded ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                      {isAdded ? "Added to Evidence" : `Add to "${targetNode ? targetNode.title.slice(0, 32) + "…" : "Node"}"`}
                    </button>

                    <button
                      onClick={() => analyzeWithClaude(p)}
                      disabled={isAnalyzing || !targetNode}
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      Analyze with Claude
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
