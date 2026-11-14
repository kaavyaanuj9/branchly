"""Neural embeddings for search: similarity by meaning, not shared words.

A small local model (bge-small, 384 dims, CPU, no API key) embeds every paper once;
vectors are cached in data/ keyed by paper id and new papers are embedded on arrival.
Used by locate (where does my idea sit, what's closest). The topic tree itself still
uses the TF-IDF/LSA embedding in model.py.

Needs `fastembed` (installed in .venv). Without it, callers fall back to LSA.
"""
import json
import re

import numpy as np

import config

MODEL = "BAAI/bge-small-en-v1.5"
VEC_PATH = config.DATA / "emb_bge_small.npy"
IDS_PATH = config.DATA / "emb_bge_small_ids.json"

try:
    from fastembed import TextEmbedding
except ImportError:          # server still runs, search falls back to LSA
    TextEmbedding = None


RERANK_MODEL = "Xenova/ms-marco-MiniLM-L-12-v2"


class Reranker:
    """Cross-encoder: reads a phrase and a sentence together and scores whether the sentence is
    actually about the phrase. Too slow for the whole corpus; used to re-check a shortlist."""

    def __init__(self):
        from fastembed.rerank.cross_encoder import TextCrossEncoder
        self.model = TextCrossEncoder(RERANK_MODEL, cache_dir=str(config.DATA / "models"))

    def score(self, query, docs, max_words=60):
        """Scores in the original order. Docs are batched by length (padding to the longest doc
        in a batch made mixed batches ~8x slower) and very long sentences are cut."""
        if not docs:
            return np.zeros(0, dtype=np.float32)
        cut = [" ".join(d.split()[:max_words]) for d in docs]
        order = sorted(range(len(cut)), key=lambda i: len(cut[i]))
        scores = list(self.model.rerank(query, [cut[i] for i in order], batch_size=32))
        out = np.empty(len(docs), dtype=np.float32)
        out[order] = scores
        return out


def available():
    return TextEmbedding is not None


def paper_text(p):
    return f"{p['title']}. {p['abstract']}"


class Embedder:
    def __init__(self):
        self.model = TextEmbedding(MODEL, cache_dir=str(config.DATA / "models"))

    def embed(self, texts, parallel=None):
        vecs = np.array(list(self.model.embed(texts, batch_size=64, parallel=parallel)), dtype=np.float32)
        return vecs / np.linalg.norm(vecs, axis=1, keepdims=True)


def load_cache():
    if VEC_PATH.exists() and IDS_PATH.exists():
        return json.loads(IDS_PATH.read_text()), np.load(VEC_PATH)
    return [], np.zeros((0, 384), dtype=np.float32)


def save_cache(ids, vecs):
    np.save(VEC_PATH, vecs.astype(np.float32))
    IDS_PATH.write_text(json.dumps(ids))


def ensure_all(papers, embedder, parallel=None, log=print, chunk=2000):
    """Embed every paper not yet in the cache; returns (ids, vecs) covering all papers."""
    ids, vecs = load_cache()
    have = set(ids)
    todo = [pid for pid in papers if pid not in have]
    if todo:
        log(f"Embedding {len(todo)} papers with {MODEL}…")
    for k in range(0, len(todo), chunk):
        part = todo[k:k + chunk]
        new = embedder.embed([paper_text(papers[p]) for p in part], parallel=parallel)
        ids += part
        vecs = np.vstack([vecs, new]) if len(vecs) else new
        save_cache(ids, vecs)   # resumable
        log(f"  {min(k + chunk, len(todo))}/{len(todo)}")
    return ids, vecs


# ---------------------------------------------------------------- sentence level
# One vector per abstract sentence, so a paper can be matched on a single part of an idea
# (its problem, its method, or its setting) without the rest of the abstract drowning it out.
SENT_VEC_PATH = config.DATA / "emb_bge_small_sent.npy"      # float16 to halve memory
SENT_IDX_PATH = config.DATA / "emb_bge_small_sent_index.json"
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def split_sentences(abstract):
    return [s for s in _SENT_SPLIT.split(abstract) if len(s.split()) > 3] or [abstract]


def load_sent_cache():
    if SENT_VEC_PATH.exists() and SENT_IDX_PATH.exists():
        idx = json.loads(SENT_IDX_PATH.read_text())
        return idx["ids"], idx["counts"], np.load(SENT_VEC_PATH)
    return [], [], np.zeros((0, 384), dtype=np.float16)


def ensure_sentences(papers, embedder, log=print, chunk=1500):
    """Embed the abstract sentences of every paper not yet cached; returns (ids, counts, vecs)."""
    ids, counts, vecs = load_sent_cache()
    have = set(ids)
    todo = [pid for pid in papers if pid not in have]
    if todo:
        log(f"Embedding abstract sentences of {len(todo)} papers…")
    for k in range(0, len(todo), chunk):
        part = todo[k:k + chunk]
        sents = [split_sentences(papers[p]["abstract"]) for p in part]
        new = embedder.embed([x for ss in sents for x in ss]).astype(np.float16)
        ids += part
        counts += [len(ss) for ss in sents]
        vecs = np.vstack([vecs, new]) if len(vecs) else new
        np.save(SENT_VEC_PATH, vecs)
        SENT_IDX_PATH.write_text(json.dumps({"ids": ids, "counts": counts}))
        log(f"  {min(k + chunk, len(todo))}/{len(todo)} papers")
    return ids, counts, vecs


if __name__ == "__main__":
    # python embeddings.py  -> embed the whole corpus (single process: faster than multiprocess here)
    import sqlite3
    import sys
    import time
    rows = sqlite3.connect(config.DB_PATH).execute("SELECT id, title, abstract FROM papers").fetchall()
    papers = {r[0]: {"title": r[1], "abstract": r[2]} for r in rows}
    t = time.time()
    emb = Embedder()
    ids, vecs = ensure_all(papers, emb, parallel=None, log=lambda m: print(m, flush=True))
    print(f"done: {len(ids)} paper vectors in {time.time() - t:.0f}s", flush=True)
    if "--sentences" in sys.argv:
        sids, counts, svecs = ensure_sentences(papers, emb, log=lambda m: print(m, flush=True))
        print(f"done: {len(svecs)} sentence vectors for {len(sids)} papers in {time.time() - t:.0f}s")
