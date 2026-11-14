"""References: who builds on whom.

Two sources, because neither alone is both fresh and complete:
  * arXiv HTML  - the reference list is there the day a paper goes public; we parse it
                  and resolve entries to arXiv ids (explicit ids, or title match).
  * Semantic Scholar batch API - clean, resolved references for the back catalogue,
                  usually available a few days after release. Replaces HTML refs.
"""
import json
import os
import re
import time
import urllib.error
import urllib.request

import ingest
from fields import FIELD

S2_BATCH = "https://api.semanticscholar.org/graph/v1/paper/batch?fields=externalIds,referenceCount,references.externalIds"
_ARXIV_ID = re.compile(r"(?<![\d.])(\d{4}\.\d{4,5})(?:v\d+)?(?![\d])")
_WORD = re.compile(r"[a-z0-9]+")
NGRAM = 6


def _strip_version(i):
    return re.sub(r"v\d+$", "", i)


# ---------------------------------------------------------------- Semantic Scholar
def _s2_post(ids, log):
    body = json.dumps({"ids": [FIELD.s2_id(i) for i in ids]}).encode()
    headers = {"Content-Type": "application/json", **ingest.UA}
    if os.environ.get("S2_API_KEY"):   # free key from semanticscholar.org/product/api: dedicated rate limit
        headers["x-api-key"] = os.environ["S2_API_KEY"]
    for attempt in range(12):
        req = urllib.request.Request(S2_BATCH, data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as ex:
            if ex.code in (429, 500, 502, 503, 504):
                wait = min(120, 5 * 2 ** attempt)
                log(f"  Semantic Scholar {ex.code}; waiting {wait}s")
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as ex:
            log(f"  Semantic Scholar unreachable ({ex}); waiting 20s")
            time.sleep(20)
    raise RuntimeError("Semantic Scholar kept refusing; try again later or set an API key")


def fetch_s2(store, ids=None, batch=100, limit=None, log=print):
    """Batches of 100: larger batches come back silently truncated (papers returned as null).
    Misses are retried once in small batches before a paper is marked as having no references."""
    ids = ids if ids is not None else store.ids_needing_refs()
    if limit:
        ids = ids[:limit]
    if not ids:
        return 0
    log(f"Fetching references for {len(ids)} papers from Semantic Scholar…")
    got = 0

    def post(chunk):
        """A rejected batch (HTTP 400) is split in half until the offending id is isolated,
        so one bad id never costs the rest of the batch."""
        try:
            return list(zip(chunk, _s2_post(chunk, log)))
        except urllib.error.HTTPError as ex:
            if ex.code != 400:
                raise
            if len(chunk) == 1:
                log(f"  Semantic Scholar rejected id {chunk[0]}")
                return [(chunk[0], None)]
            mid = len(chunk) // 2
            return post(chunk[:mid]) + post(chunk[mid:])

    def run(chunk_ids, size, final):
        nonlocal got
        misses = []
        for k in range(0, len(chunk_ids), size):
            chunk = chunk_ids[k:k + size]
            for pid, item in post(chunk):
                refs = (item or {}).get("references")
                if not refs:   # not indexed yet, withheld by publisher, or dropped by the batch
                    misses.append(pid)
                    continue
                cited = {k for k in (FIELD.ref_key((r or {}).get("externalIds")) for r in refs) if k}
                store.set_refs(pid, cited, "s2", item.get("referenceCount") or len(refs))
                got += 1
            if (k // size) % 10 == 9 or k + size >= len(chunk_ids):
                log(f"  {min(k + size, len(chunk_ids))}/{len(chunk_ids)} {'retried' if final else 'done'}, {got} with references")
            time.sleep(1.1)
        return misses

    misses = run(ids, batch, final=False)
    if misses:
        misses = run(misses, 25, final=True)
        store.mark_refs_missing(misses)
    return got


# ---------------------------------------------------------------- foundations (biology)
S2_META = ("https://api.semanticscholar.org/graph/v1/paper/batch?"
           "fields=title,abstract,year,venue,publicationDate,externalIds,authors")


def fetch_foundations(store, min_cites=2, limit=60000, log=print):
    """Published papers the corpus's own papers cite at least `min_cites` times, added to the
    corpus with abstracts as source "foundation". Only citations from non-foundation papers
    count, so the corpus doesn't snowball outward through citations of citations."""
    have = {r[0] for r in store.conn.execute("SELECT id FROM papers")}
    counts = {}
    for cited, n in store.conn.execute(
            "SELECT r.cited, COUNT(*) FROM refs r JOIN papers p ON p.id = r.citing "
            "WHERE p.source != 'foundation' GROUP BY r.cited"):
        if cited not in have and n >= min_cites:
            counts[cited] = n
    todo = sorted(counts, key=lambda c: -counts[c])[:limit]
    log(f"{len(todo)} cited papers qualify as foundations (cited >= {min_cites} times)")
    added = 0
    for k in range(0, len(todo), 100):
        chunk = todo[k:k + 100]
        body = json.dumps({"ids": [FIELD.s2_id(i) for i in chunk]}).encode()
        headers = {"Content-Type": "application/json", **ingest.UA}
        if os.environ.get("S2_API_KEY"):
            headers["x-api-key"] = os.environ["S2_API_KEY"]
        res = None
        for attempt in range(8):
            try:
                req = urllib.request.Request(S2_META, data=body, headers=headers)
                with urllib.request.urlopen(req, timeout=120) as r:
                    res = json.loads(r.read())
                break
            except urllib.error.HTTPError as ex:
                if ex.code in (429, 500, 502, 503, 504):
                    time.sleep(min(120, 5 * 2 ** attempt))
                    continue
                log(f"  Semantic Scholar refused a foundations batch ({ex.code}); skipping it")
                break
        papers = []
        for pid, item in zip(chunk, res or []):
            if not item or not item.get("title") or not item.get("abstract"):
                continue                       # no abstract: can't be searched or placed
            when = item.get("publicationDate") or (f"{item['year']}-07-01" if item.get("year") else None)
            if not when:
                continue
            ts = time.mktime(time.strptime(when, "%Y-%m-%d"))
            papers.append({"id": pid, "version": 1, "title": item["title"], "abstract": item["abstract"],
                           "authors": [a.get("name", "") for a in item.get("authors") or []][:20],
                           "categories": [item.get("venue") or "journal"],
                           "published": ts, "updated": ts, "announced": ts})
        added += store.add_papers(papers, "foundation")
        if (k // 100) % 10 == 9 or k + 100 >= len(todo):
            log(f"  {min(k + 100, len(todo))}/{len(todo)} looked up, {added} added")
        time.sleep(1.1)
    return added


# ---------------------------------------------------------------- arXiv HTML (day 0)
class TitleIndex:
    """Find corpus papers mentioned in free-text bibliography entries by title."""

    def __init__(self, papers):
        self.idx = {}
        for pid, p in papers.items():
            self.add(pid, p["title"])

    def add(self, pid, title):
        w = _WORD.findall(title.lower())
        if len(w) >= NGRAM:
            self.idx[tuple(w[:NGRAM])] = pid

    def find(self, text):
        w = _WORD.findall(text.lower())
        for i in range(len(w) - NGRAM + 1):
            hit = self.idx.get(tuple(w[i:i + NGRAM]))
            if hit:
                return hit
        return None


def html_refs(pid, title_index):
    """(cited arXiv ids, number of bibliography entries) or None if no HTML version."""
    try:
        html = ingest._get(f"https://arxiv.org/html/{pid}", timeout=60).decode("utf-8", "ignore")
    except urllib.error.HTTPError:
        return None
    items = re.split(r"<li[^>]+ltx_bibitem", html)[1:]
    if not items:
        return None
    cited = set()
    for it in items:
        body = it.split("</li>", 1)[0]
        ids = _ARXIV_ID.findall(body)
        if ids:
            cited.update(ids)
            continue
        hit = title_index.find(re.sub(r"<[^>]+>", " ", body))
        if hit:
            cited.add(hit)
    cited.discard(pid)
    return cited, len(items)
