"""The live tree: ingestion loop, incremental growth, and the read models the
web UI and the agent API serve."""
import json
import os
import queue
import threading
import time
from collections import Counter, defaultdict

import numpy as np

import alerts
import config
import embeddings
import refs
import source as ingest          # the field's literature source (arXiv or bioRxiv)
from fields import FIELD
from model import TreeModel
from store import Store

DAY = 86400.0
LIVE_SOURCES = {"listing", "api", "rss", "biorxiv"}   # caught by the poller (catch time is meaningful)


def _idea_text(p):
    """Title + first sentence: roughly what someone types when describing an idea."""
    first = p["abstract"].split(". ")[0]
    return f"{p['title']}. {first}."
SIGNAL_KINDS = {"claim", "promising", "dead_end", "note", "done"}


class Engine:
    def __init__(self, log=print):
        self.log = log
        self.store = Store()
        self.lock = threading.RLock()
        self.subscribers = []
        self.status = {"last_poll": None, "last_poll_new": 0, "last_error": None, "polls": 0,
                       "last_new_at": None}
        self.model = None
        self.E, self.E_row = None, {}       # neural vectors for search (embeddings.py)
        self.embedder = None
        self.calib = {}                     # novelty calibration per search method
        self.S = None                       # sentence vectors (float16) for aspect matching
        self.S_start, self.S_count, self.S_pids = None, None, []
        self.reranker = None
        self.alerts = alerts.Alerts(self)

    # ------------------------------------------------------------ build / load
    def ensure_built(self):
        if self.store.count() == 0:
            self.log(f"Backfilling the last {config.BACKFILL_DAYS} days of {config.FIELD_NAME} papers…")
            papers = ingest.backfill(log=self.log)
            n = self.store.add_papers(papers, "backfill")
            self.log(f"  stored {n} papers")
        if config.MODEL_PATH.exists():
            self.model = TreeModel.load()
            self._reindex()
            # papers that arrived while the server was down
            unplaced = [p for p in self.papers.values() if not p.get("node") or p["node"] not in self.model.nodes]
            if unplaced:
                self._place(unplaced)
        else:
            self.rebuild()
        self._ensure_roots()
        threading.Thread(target=self._load_neural, daemon=True).start()

    def rebuild(self):
        self.log("Growing the tree from all papers…")
        papers = self.store.all_papers()
        model = TreeModel()
        assignments, mapping = model.fit(papers, old=self.model, log=self.log, vectors=self._tree_vectors(papers))
        with self.lock:
            self.store.set_positions(assignments)
            if mapping:
                self.store.remap_signals(mapping)
            self.model = model
            model.save()
            self.store.set_meta("built_at", time.time())
            self.store.set_meta("built_size", len(papers))
            self._reindex()
        self.broadcast({"type": "rebuilt"})

    def _reindex(self):
        with self.lock:
            rows = self.store.all_papers()
            self.papers = {}
            for r in rows:
                r["authors"] = json.loads(r["authors"])
                r["categories"] = json.loads(r["categories"])
                self.papers[r["id"]] = r
            self.order = list(self.papers)
            self.X = self.model.embed(rows) if rows else np.zeros((0, 1))
            self.row = {pid: i for i, pid in enumerate(self.order)}
            self.by_node = defaultdict(list)
            for pid, p in self.papers.items():
                if p.get("node"):
                    self.by_node[p["node"]].append(pid)
            self.titles = refs.TitleIndex(self.papers)
        self._load_graph()

    def _load_graph(self):
        """In-tree citation graph: cites[a] = papers in the tree that a references."""
        cites, cited_by = defaultdict(set), defaultdict(set)
        for a, b in self.store.all_refs():
            if a in self.papers and b in self.papers:
                cites[a].add(b)
                cited_by[b].add(a)
        known = {pid for pid, p in self.papers.items() if p.get("refs_source") in ("s2", "html")}
        with self.lock:
            self.cites, self.cited_by, self.refs_known = cites, cited_by, known

    def _ensure_roots(self):
        """Landmark papers: shown as each branch's lineage and added to the corpus so
        citation lineages can reach them even when they predate the "agent" vocabulary."""
        want = sorted({r for b in config.BRANCHES for r in b["roots"]} | set(config.SURVEY_ROOTS)
                      | set(config.EXTRA_LANDMARKS))
        have = self.store.get_meta("roots", {})
        missing = [r for r in want if r not in have or r not in self.papers]
        if missing:
            try:
                fetched = ingest.fetch_ids(missing)
                for p in fetched:
                    have[p["id"]] = {"id": p["id"], "title": p["title"],
                                     "year": time.gmtime(p["published"]).tm_year}
                self.store.set_meta("roots", have)
                self.store.add_papers([p for p in fetched if p["id"] not in self.papers], "landmark")
                rows = self.store.papers_by_ids([p["id"] for p in fetched if p["id"] not in self.papers])
                if rows:
                    self._place(rows)
            except Exception as ex:
                self.log(f"  could not fetch landmark papers: {ex}")
        self.roots = have

    # ------------------------------------------------------------ live growth
    def _tree_vectors(self, papers):
        """Neural vectors aligned with `papers` to grow the tree in, or None (keyword/LSA space)."""
        if os.environ.get("RT_TREE_SPACE", "hybrid") == "lsa" or not embeddings.available():
            return None
        ids, vecs = embeddings.load_cache()
        row = {p: i for i, p in enumerate(ids)}
        if any(p["id"] not in row for p in papers):
            embedder = self.embedder or embeddings.Embedder()
            ids, vecs = embeddings.ensure_all({p["id"]: p for p in papers}, embedder, log=self.log)
            row = {p: i for i, p in enumerate(ids)}
        return vecs[[row[p["id"]] for p in papers]]

    def _place(self, rows):
        vectors = None
        if getattr(self.model, "space", "lsa") != "lsa":
            if self.embedder is None:
                self.embedder = embeddings.Embedder()
            vectors = self.embedder.embed([embeddings.paper_text(r) for r in rows])
        placed = self.model.place(rows, vectors=vectors)
        self.store.set_positions([(pid, b, n) for pid, b, n, _ in placed])
        X = self.model.embed(rows)
        with self.lock:
            for (pid, b, n, _), r, x in zip(placed, rows, X):
                old = self.papers.get(pid, {}).get("node")
                if old and pid in self.by_node.get(old, []):
                    self.by_node[old].remove(pid)
                r = dict(r, branch=b, node=n)
                if isinstance(r.get("authors"), str):
                    r["authors"] = json.loads(r["authors"])
                    r["categories"] = json.loads(r["categories"])
                if pid not in self.row:
                    self.row[pid] = len(self.order)
                    self.order.append(pid)
                    self.X = np.vstack([self.X, x[None]])
                self.papers[pid] = r
                self.by_node[n].append(pid)
                self.titles.add(pid, r["title"])
        return placed

    # ------------------------------------------------------------ neural search vectors
    def _load_neural(self):
        """Load cached paper vectors, embed any missing ones, then enable neural search."""
        if not embeddings.available():
            self.log("fastembed not installed: search uses the TF-IDF/LSA embedding")
            return
        try:
            self.embedder = embeddings.Embedder()
            ids, vecs = embeddings.ensure_all(self.papers, self.embedder, log=self.log)
            with self.lock:
                self.E_row = {pid: i for i, pid in enumerate(ids)}
                self.E = vecs
            self.calib = self.store.get_meta("novelty_calibration", {}) or {}
            if "neural_short" not in self.calib:
                self.calibrate()
            self.log(f"neural search ready ({len(ids)} papers)")
            sids, counts, svecs = embeddings.ensure_sentences(self.papers, self.embedder, log=self.log)
            with self.lock:
                self._set_sentences(sids, counts, svecs)
            self.reranker = embeddings.Reranker()
            self.log(f"aspect matching ready ({len(svecs)} sentences)")
        except Exception as ex:
            self.log(f"neural search unavailable: {ex}")

    def _set_sentences(self, sids, counts, svecs):
        self.S_pids = list(sids)
        self.S_count = np.array(counts)
        self.S_start = np.concatenate([[0], np.cumsum(self.S_count)[:-1]]).astype(int)
        self.S = svecs

    def _embed_new(self, rows):
        if self.embedder is None or self.E is None:
            return
        if self.S is not None:
            sents = [embeddings.split_sentences(r["abstract"]) for r in rows]
            new = self.embedder.embed([x for ss in sents for x in ss]).astype(np.float16)
            with self.lock:
                self._set_sentences(self.S_pids + [r["id"] for r in rows],
                                    list(self.S_count) + [len(ss) for ss in sents], np.vstack([self.S, new]))
                embeddings.SENT_IDX_PATH.write_text(json.dumps({"ids": self.S_pids, "counts": [int(c) for c in self.S_count]}))
                np.save(embeddings.SENT_VEC_PATH, self.S)
        vecs = self.embedder.embed([embeddings.paper_text(r) for r in rows])
        with self.lock:
            for r, v in zip(rows, vecs):
                if r["id"] not in self.E_row:
                    self.E_row[r["id"]] = len(self.E)
                    self.E = np.vstack([self.E, v[None]])
            ids = sorted(self.E_row, key=self.E_row.get)
            embeddings.save_cache(ids, self.E)

    def _search_space(self, method):
        """(matrix, ordered ids) for a search method; neural only once every paper is embedded."""
        if method != "lsa" and self.E is not None and all(p in self.E_row for p in self.papers):
            key = (len(self.E_row), len(self.papers))
            if getattr(self, "_space_key", None) != key:
                # only vectors of papers the tree knows (the cache can hold extras, e.g. papers
                # embedded by another process or later removed)
                ids = [p for p in sorted(self.E_row, key=self.E_row.get) if p in self.papers]
                self._space = (self.E[[self.E_row[p] for p in ids]], ids)
                self._space_key = key
            return ("neural",) + self._space
        return "lsa", self.X, self.order

    def _query_vec(self, method, text):
        if method == "neural":
            return self.embedder.embed([text])[0]
        return self.model.lsa_vec(text)

    SHORT_QUERY_WORDS = 20   # ideas up to this many words use the title-only calibration

    def calibrate(self, sample=1500, days=150):
        """How close is a real new paper to the closest earlier paper, at the moment it came out?
        Two query styles, because similarity depends on query length: title + first sentence
        (~35 words, like a described idea) and title alone (~12 words, like a one-line idea).
        The distributions turn a similarity into a percentile instead of a hand-picked threshold."""
        out = {}
        now = time.time()
        rng = np.random.default_rng(0)
        for method in ("lsa", "neural"):
            name, M, ids = self._search_space(method)
            if name != method:
                continue
            ann = np.array([self.papers[i]["announced"] for i in ids])
            recent = [k for k in np.where(ann > now - days * DAY)[0]]
            pick = rng.choice(recent, size=min(sample, len(recent)), replace=False)
            for suffix, make in (("", _idea_text), ("_short", lambda p: p["title"])):
                queries = [make(self.papers[ids[k]]) for k in pick]
                Q = self.embedder.embed(queries) if method == "neural" else self.model.embed(
                    [{"title": q, "abstract": q} for q in queries])
                best = []
                for q, k in zip(Q, pick):
                    sims = M @ q
                    sims[ann >= ann[k]] = -1           # only work that existed before it
                    best.append(float(sims.max()))
                out[method + suffix] = [float(x) for x in np.percentile(best, range(101))]
        self.calib.update(out)
        self.store.set_meta("novelty_calibration", self.calib)
        return out

    def _percentile(self, method, sim):
        c = self.calib.get(method)
        if not c:
            return None
        return int(np.searchsorted(np.array(c), sim))

    def _fetch_html_refs(self, ids):
        """Day-0 references for brand-new papers (arXiv HTML or bioRxiv JATS XML)."""
        found = 0
        for pid in ids:
            try:
                res = ingest.day0_refs(pid, self.titles)
            except Exception as ex:
                self.log(f"  html refs {pid}: {ex}")
                res = None
            if res is None:
                self.store.mark_refs_missing([pid])
                continue
            cited, total = res
            if self.store.set_refs(pid, cited, "html", total):
                found += 1
                self.papers[pid]["refs_source"] = "html"
        self._load_graph()
        self.log(f"  day-0 references parsed for {found}/{len(ids)} new papers")
        self.broadcast({"type": "refs"})

    def _refresh_s2(self):
        try:
            if refs.fetch_s2(self.store, limit=5000, log=self.log):
                for r in self.store.conn.execute("SELECT id, refs_source FROM papers"):
                    if r[0] in self.papers:
                        self.papers[r[0]]["refs_source"] = r[1]
                self._load_graph()
                self.broadcast({"type": "refs"})
        except Exception as ex:
            self.log(f"Semantic Scholar refresh failed: {ex}")

    def poll_once(self):
        t0 = time.time()
        try:
            found = ingest.poll_new(set(self.papers))
            self.status["last_error"] = None
        except Exception as ex:
            self.status.update(last_poll=t0, last_error=str(ex))
            self.log(f"poll error: {ex}")
            return []
        now = time.time()
        fresh = []
        for p, src in found:
            p["announced"] = min(p["announced"], now)
            fresh.append((p, src))
        for src in ("listing", "api", "rss", "biorxiv"):
            batch = [p for p, s in fresh if s == src]
            if batch:
                self.store.add_papers(batch, src)
        self.status.update(last_poll=t0, last_poll_new=len(fresh), polls=self.status["polls"] + 1)
        if not fresh:
            self.broadcast({"type": "status", "status": self.status_json()})
            return []
        rows = self.store.papers_by_ids([p["id"] for p, _ in fresh])
        placed = self._place(rows)
        try:
            self._embed_new(rows)
        except Exception as ex:
            self.log(f"  embedding new papers failed: {ex}")
        self.status["last_new_at"] = now
        self.log(f"+{len(placed)} new papers")
        self.broadcast({"type": "papers", "papers": [self._card(pid) for pid, *_ in placed],
                        "status": self.status_json()})
        threading.Thread(target=self._fetch_html_refs, args=([pid for pid, *_ in placed],), daemon=True).start()
        threading.Thread(target=self.alerts.on_new_papers, args=([pid for pid, *_ in placed],), daemon=True).start()
        built = self.store.get_meta("built_size", 1)
        if len(self.papers) - built > config.REBUILD_FRACTION * built:
            threading.Thread(target=self.rebuild, daemon=True).start()
        return placed

    def run_poller(self, first_delay=0):
        time.sleep(first_delay)
        last_s2 = time.time() - 6 * 3600 + 1800   # first Semantic Scholar refresh 30 min after start
        while True:
            self.poll_once()
            if time.time() - last_s2 > 6 * 3600:
                last_s2 = time.time()
                threading.Thread(target=self._refresh_s2, daemon=True).start()
            hot = ingest.in_hot_window()
            time.sleep(config.HOT_POLL_SECONDS if hot else ingest.POLL_SECONDS)

    # ------------------------------------------------------------ events
    def subscribe(self):
        q = queue.Queue(maxsize=100)
        self.subscribers.append(q)
        return q

    def unsubscribe(self, q):
        if q in self.subscribers:
            self.subscribers.remove(q)

    def broadcast(self, ev):
        for q in list(self.subscribers):
            try:
                q.put_nowait(ev)
            except queue.Full:
                pass

    # ------------------------------------------------------------ read models
    def _card(self, pid, abstract_chars=0):
        p = self.papers[pid]
        c = {"id": pid, "title": p["title"], "authors": p["authors"][:4] + (["et al."] if len(p["authors"]) > 4 else []),
             "announced": p["announced"], "first_seen": p["first_seen"], "source": p["source"],
             "node": p.get("node"), "branch": p.get("branch"), "url": FIELD.paper_url(pid),
             "bridge": self.model.bridges.get(pid),
             # neutral "explored" indicator: how many papers in the tree build on this one
             "built_on": len(self.cited_by.get(pid, ())), "builds_on": len(self.cites.get(pid, ())),
             "refs_known": pid in self.refs_known}
        if abstract_chars:
            a = p["abstract"]
            c["abstract"] = a if len(a) <= abstract_chars else a[:abstract_chars].rsplit(" ", 1)[0] + "…"
        return c

    def _members(self, nid):
        out, stack = [], [nid]
        while stack:
            n = stack.pop()
            out.extend(self.by_node.get(n, []))
            stack.extend(self.model.nodes[n]["children"] if n in self.model.nodes else [])
        return out

    def _signal_summary(self, sigs):
        c = Counter(s["kind"] for s in sigs)
        return {k: c.get(k, 0) for k in ("claim", "promising", "dead_end", "note", "done")}

    def _field_share(self, now):
        """Share of all papers that are in the frontier window (the field's own pace)."""
        n = len(self.papers)
        recent = sum(1 for p in self.papers.values() if p["announced"] > now - config.FRONTIER_DAYS * DAY)
        return recent / n if n else 0

    def _stats(self, ids, now, field_share):
        """momentum = this node's recent share / the whole field's recent share (1.0 = same pace)."""
        ann = np.array([self.papers[i]["announced"] for i in ids]) if ids else np.zeros(0)
        n = len(ids)
        n7 = int((ann > now - 7 * DAY).sum())
        n14 = int((ann > now - config.FRONTIER_DAYS * DAY).sum())
        expected = n * field_share
        weeks = [int(((ann > now - (w + 1) * 7 * DAY) & (ann <= now - w * 7 * DAY)).sum()) for w in range(8)][::-1]
        return {"count": n, "n7": n7, "n14": n14, "newest": float(ann.max()) if n else None,
                "momentum": round(n14 / expected, 2) if expected > 0 else 0, "weeks": weeks}

    def tree_json(self):
        with self.lock:
            now = time.time()
            share = self._field_share(now)
            sigs = defaultdict(list)
            for s in self.store.signals():
                sigs[s["node"]].append(s)

            def build(nid):
                n = self.model.nodes[nid]
                ids = self._members(nid)
                d = {"id": nid, "label": n["label"], "keywords": n.get("keywords", []), "depth": n["depth"],
                     "branch": n["branch"], **self._stats(ids, now, share),
                     "signals": self._signal_summary(sigs.get(nid, []))}
                if n["children"]:
                    d["children"] = [build(c) for c in n["children"]]
                else:
                    newest = sorted(ids, key=lambda i: -self.papers[i]["announced"])[:3]
                    d["tips"] = [self._card(i) for i in newest]
                    d["opportunity"] = self._opportunity(d)
                return d

            kids = [build(b["id"]) for b in config.BRANCHES]
            return {"id": "root", "label": config.FIELD_NAME, "depth": 0, "children": kids,
                    "count": len(self.papers), "status": self.status_json()}

    @staticmethod
    def _opportunity(d):
        s = d["signals"]
        score = np.log1p(d["n14"]) * min(d["momentum"], 3.0) / (1 + s["claim"] + s["done"])
        if s["dead_end"] > s["promising"]:
            score *= 0.5
        elif s["promising"]:
            score *= 1.2
        return round(float(score), 3)

    def path(self, nid):
        out = []
        while nid in self.model.nodes:
            n = self.model.nodes[nid]
            out.append({"id": nid, "label": n["label"]})
            nid = n["parent"]
        return [{"id": "root", "label": config.FIELD_NAME}] + out[::-1]

    def node_json(self, nid, limit=60):
        with self.lock:
            if nid not in self.model.nodes:
                return None
            n = self.model.nodes[nid]
            ids = sorted(self._members(nid), key=lambda i: -self.papers[i]["announced"])
            now = time.time()
            sigs = self.store.signals(nid)
            public = [s for s in sigs if s["visibility"] != "private"]
            c = np.array(n["centroid"])
            near = []
            for oid, o in self.model.nodes.items():
                if o["branch"] != n["branch"] and not o["children"]:
                    near.append((float(np.dot(c, o["centroid"])), oid))
            near.sort(reverse=True)
            bridge_counts = Counter(self.model.bridges[i] for i in ids if i in self.model.bridges)
            branch = next(b for b in config.BRANCHES if b["id"] == n["branch"])
            return {
                "id": nid, "label": n["label"], "keywords": n.get("keywords", []), "depth": n["depth"],
                "branch": n["branch"], "branch_desc": branch["desc"], "path": self.path(nid),
                "is_leaf": not n["children"],
                "children": [{"id": k, "label": self.model.nodes[k]["label"]} for k in n["children"]],
                **self._stats(ids, now, self._field_share(now)),
                "signals": self._signal_summary(sigs),
                "signal_log": [{k: s[k] for k in ("kind", "who", "actor", "text", "created")} for s in public[:30]],
                "private_claims": sum(1 for s in sigs if s["visibility"] == "private" and s["kind"] == "claim"),
                "exemplars": [self._card(e) for e in n.get("exemplars", []) if e in self.papers],
                "papers": [self._card(i, abstract_chars=420) for i in ids[:limit]],
                "near": [{"id": oid, "label": self.model.nodes[oid]["label"], "branch": self.model.nodes[oid]["branch"],
                          "sim": round(s, 3)} for s, oid in near[:4]],
                "bridges": [{"branch": b, "label": self._branch_label(b), "papers": k}
                            for b, k in bridge_counts.most_common(3)],
                "roots": ([self.roots[r] for r in branch["roots"] if r in self.roots] if branch["roots"]
                          else self._derived_landmarks(n["branch"])),
            }

    def _derived_landmarks(self, bid, k=4):
        """No hand-picked landmarks: the branch's most built-on papers stand in for them."""
        ids = [p for p, d in self.papers.items() if d.get("branch") == bid]
        top = sorted(ids, key=lambda p: -len(self.cited_by.get(p, ())))[:k]
        return [{"id": p, "title": self.papers[p]["title"], "year": time.gmtime(self.papers[p]["announced"]).tm_year,
                 "url": FIELD.paper_url(p), "built_on": len(self.cited_by.get(p, ()))}
                for p in top if self.cited_by.get(p)]

    def _branch_label(self, bid):
        return next(b["label"] for b in config.BRANCHES if b["id"] == bid)

    def frontier(self, branch=None, days=config.FRONTIER_DAYS, limit=15, per_leaf=5):
        """Open frontier leaves, ranked by opportunity. Designed for agents."""
        tree = self.tree_json()
        leaves = []

        def walk(d, path):
            path = path + [d["label"]]
            if "children" in d:
                for c in d["children"]:
                    walk(c, path)
            else:
                leaves.append((d, path))
        for b in tree["children"]:
            if branch in (None, b["id"]):
                walk(b, [])
        leaves.sort(key=lambda x: -x[0]["opportunity"])
        cutoff = time.time() - days * DAY
        out = []
        with self.lock:
            for d, path in leaves[:limit]:
                ids = sorted((i for i in self.by_node.get(d["id"], []) if self.papers[i]["announced"] > cutoff),
                             key=lambda i: -self.papers[i]["announced"])
                out.append({"node": d["id"], "path": path, "keywords": d["keywords"], "count": d["count"],
                            "new_last_14d": d["n14"], "momentum": d["momentum"], "opportunity": d["opportunity"],
                            "signals": d["signals"],
                            "frontier_papers": [self._card(i, abstract_chars=600) for i in ids[:per_leaf]]})
        return out

    def locate(self, text, k=8, vote=15, method="auto"):
        """Place an idea on the tree by its nearest papers (kNN vote), plus a novelty check.
        method: auto (neural when ready, else lsa) | neural | lsa."""
        with self.lock:
            name, M, ids = self._search_space(method)
            x = self._query_vec(name, text)
            sims = M @ x
            top = np.argsort(-sims)
            votes = Counter()
            for i in top[:vote]:
                node = self.papers[ids[i]].get("node")
                if node:
                    votes[node] += float(sims[i])
            nid = votes.most_common(1)[0][0]
            bid = self.model.nodes[nid]["branch"]
            # how clearly the neighbours agree on this home (share of vote weight)
            confidence = round(votes[nid] / sum(votes.values()), 2)
            hits = [dict(self._card(ids[i], abstract_chars=300), sim=round(float(sims[i]), 3)) for i in top[:k]]
            best = hits[0]["sim"] if hits else 0
            # second branch: strongest vote weight outside the chosen branch
            other = Counter()
            for node, w in votes.items():
                b = self.model.nodes[node]["branch"]
                if b != bid:
                    other[b] += w
            bridge = other.most_common(1)[0][0] if other and other.most_common(1)[0][1] >= 0.5 * votes[nid] else None
            short = len(text.split()) <= self.SHORT_QUERY_WORDS
            pct = self._percentile(name + ("_short" if short else ""), best)
            if pct is None:
                pct = self._percentile(name, best)
            top20 = [ids[i] for i in top[:20]]
        # Crowdedness: how many of the 20 closest papers a cross-encoder judges to directly
        # address the idea. Max similarity alone misled on short ideas mixing two concepts.
        relevant = None
        if self.reranker is not None:
            docs = [self.papers[p]["title"] + ". " + self.papers[p]["abstract"][:300] for p in top20]
            relevant = int((self.reranker.score(text, docs) > 0).sum())
            level = "crowded" if relevant >= 6 else "related" if relevant >= 2 else "sparse"
        elif pct is not None:
            level = "crowded" if pct >= 75 else "related" if pct >= 25 else "sparse"
        else:   # nothing calibrated yet: fixed thresholds (tuned for lsa)
            level = "crowded" if best > 0.7 else "related" if best > 0.5 else "sparse"
        n = f"{relevant} of the 20 closest papers directly address" if relevant is not None else None
        hint = {
            "crowded": (f"Crowded: {n} this idea. " if n else "Crowded: very close prior work exists. ")
                       + "Read the top matches before committing.",
            "related": (f"Related work exists: {n} this idea. " if n else "Related work exists. ")
                       + "Position against the top matches; the gap may be in the combination.",
            "sparse": (f"Sparse: {n} this idea. " if n else "Unusually far from everything in the tree. ")
                      + "Possibly open ground, or outside what the tree covers (" + config.COVERAGE + "); check other literature.",
        }[level]
        return {"branch": bid, "node": nid, "path": self.path(nid), "method": name,
                "placement_confidence": confidence,
                "bridge": bridge and {"branch": bridge, "label": self._branch_label(bridge)},
                "nearest": hits, "max_similarity": best, "closeness_percentile": pct,
                "directly_relevant": relevant, "relevance_checked": 20 if relevant is not None else 0,
                "novelty_level": level, "novelty_hint": hint}

    # ------------------------------------------------------------ reading list
    def reading_list(self, text, seeds=50, n_found=11, n_close=5, n_new=4, recent_days=90,
                     before=None, method="auto"):
        """What to read for an idea, using the citation lineage around it.

        1. The `seeds` papers closest in meaning to the idea are its neighbourhood.
        2. Foundations: papers the neighbourhood cites, scored by how many neighbours cite them
           (weighted by closeness) times how specific that is to this neighbourhood compared with
           the whole tree. Papers almost everyone cites become "classics" rather than list items.
        3. Closest work: the nearest papers themselves, to position against.
        4. Newest frontier: recent papers that are close to the idea or build on the neighbourhood.
        `before` (unix time) restricts everything to papers public before then (for evaluation).
        """
        with self.lock:
            name, M, ids = self._search_space(method)
            x = self._query_vec(name, text)
            sims = M @ x
            ann = np.array([self.papers[i]["announced"] for i in ids])
            if before is not None:
                sims = np.where(ann < before, sims, -9.0)
            row = {pid: i for i, pid in enumerate(ids)}
            order = np.argsort(-sims)
            seed_ids = [ids[i] for i in order[:seeds]]
            weight = {pid: 1 / np.sqrt(r + 1) for r, pid in enumerate(seed_ids)}
            allowed = (lambda q: self.papers[q]["announced"] < before) if before is not None else (lambda q: True)

            # foundations: co-cited by the neighbourhood, specific to it
            n_known = max(1, len(self.refs_known))
            cite_w, cite_n = Counter(), Counter()
            for s in seed_ids:
                for c in self.cites.get(s, ()):
                    if allowed(c):
                        cite_w[c] += weight[s]
                        cite_n[c] += 1
            known_seeds = sum(1 for s in seed_ids if self.cites.get(s))
            found, classics = [], []
            for c, cw in cite_w.items():
                if cite_n[c] < 2:
                    continue
                glob = sum(1 for q in self.cited_by.get(c, ()) if allowed(q))
                expected = max(known_seeds, 1) * glob / n_known
                lift = cite_n[c] / max(expected, 1e-9)
                (classics if glob > 0.02 * n_known else found).append((cw * np.log1p(lift), c))
            found.sort(reverse=True)
            classics.sort(reverse=True)
            found_ids = [c for _, c in found[:n_found]]

            # closest work (not already a foundation)
            close_ids = [s for s in seed_ids if s not in found_ids][:n_close]

            # newest frontier: recent papers near the idea or building on the neighbourhood
            horizon = (before if before is not None else time.time()) - recent_days * DAY
            near = set(seed_ids[:15])
            cand = {}
            for s in seed_ids:
                if self.papers[s]["announced"] > horizon:
                    cand[s] = 0
            for s in list(near) + found_ids:
                for q in self.cited_by.get(s, ()):
                    if allowed(q) and self.papers[q]["announced"] > horizon:
                        cand[q] = cand.get(q, 0) + 1
            taken = set(found_ids) | set(close_ids)
            new_ids = sorted((q for q in cand if q not in taken and q in row),
                             key=lambda q: -(float(sims[row[q]]) + 0.01 * cand[q]))[:n_new]

            def card(pid, role, reason):
                c = self._card(pid, abstract_chars=260)
                c.update(role=role, reason=reason, sim=round(float(sims[row[pid]]), 3) if pid in row else None)
                return c

            k = len(seed_ids)
            sections = {
                "foundations": [card(c, "foundation", f"cited by {cite_n[c]} of the {k} papers closest to your idea")
                                for c in sorted(found_ids, key=lambda c: self.papers[c]["announced"])],
                "closest": [card(s, "closest", f"#{seed_ids.index(s) + 1} closest in meaning") for s in close_ids],
                "newest": [card(q, "newest", (f"builds on {cand[q]} of your closest papers or foundations"
                                              if cand[q] else "recent and close in meaning"))
                           for q in sorted(new_ids, key=lambda q: -self.papers[q]["announced"])],
            }
            classic_cards = [dict(self._card(c), reason=f"cited by {cite_n[c]} of {k}; cited across the whole field")
                             for _, c in classics[:5]]
            picked = [c["id"] for sec in sections.values() for c in sec]
            return {"query": text, "method": name, "sections": sections, "classics": classic_cards,
                    "order": ["foundations", "closest", "newest"],
                    "coverage": {"neighbourhood": k, "with_references": known_seeds},
                    "nodes": [self._lin_node(pid, inside=True, lane={"foundation": "Foundations",
                                                                      "closest": "Closest work",
                                                                      "newest": "Newest frontier"}[c["role"]])
                              for sec in sections.values() for c, pid in ((c, c["id"]) for c in sec)],
                    "edges": self._edges(set(picked)), "ids": picked}

    # ------------------------------------------------------------ aspects: problem / method / setting
    ASPECTS = ("problem", "method", "setting")

    def _aspect_scores(self, q):
        """Per paper: best similarity of any abstract sentence to q (and which sentence)."""
        sims = np.empty(len(self.S), dtype=np.float32)
        for k in range(0, len(self.S), 50000):      # chunks keep the float32 temporaries small
            sims[k:k + 50000] = self.S[k:k + 50000].astype(np.float32) @ q
        best = np.maximum.reduceat(sims, self.S_start)
        return best, sims

    def _evidence(self, pid, sims, i):
        """The sentence of paper i that matched best."""
        a, n = self.S_start[i], self.S_count[i]
        j = int(np.argmax(sims[a:a + n]))
        sents = embeddings.split_sentences(self.papers[pid]["abstract"])
        return sents[j] if j < len(sents) else ""

    # Stage 1 (recall): sentence-embedding z-score bar for candidates.
    # Stage 2 (precision): cross-encoder score of the paper's best sentence for that part.
    # Calibrated with evals/aspects_phrases_eval.py (12 real papers described in short phrases):
    # cutoff -4 found all 12, and none of the 12 shuffled (fake) combinations; see README.
    ASPECT_Z_CANDIDATE = 1.5
    RERANK_POSSIBLE, RERANK_STRONG = -4.0, 0.0
    SHORTLIST = 40          # candidates per combination of parts
    SHORTLIST_SINGLE = 15   # per single part: only needs to show whether anything matches at all
    SENTS_PER_PART = 4      # each candidate's sentences most similar to a part get reranked

    def aspects(self, parts, top=4, rerank_possible=None, rerank_strong=None, exclude=()):
        """Match each part of an idea separately, then find papers that combine them.
        parts: {"problem": str, "method": str, "setting": str} (any two or three).
        Embedding similarity of each abstract sentence shortlists candidates; a cross-encoder
        then checks that some sentence of the paper really is about each part."""
        parts = {k: v.strip() for k, v in parts.items() if k in self.ASPECTS and v and v.strip()}
        if len(parts) < 2:
            raise ValueError("give at least two of: problem, method, setting")
        if self.S is None or self.reranker is None:
            raise ValueError("aspect matching is still loading")
        r_pos = self.RERANK_POSSIBLE if rerank_possible is None else rerank_possible
        r_str = max(r_pos, self.RERANK_STRONG if rerank_strong is None else rerank_strong)
        from itertools import combinations
        keys = list(parts)
        Q = self.embedder.embed([parts[k] for k in keys])
        with self.lock:                      # stage 1 only; reranking below runs unlocked
            Z, raw = {}, {}
            for k, q in zip(keys, Q):
                best, sims = self._aspect_scores(q)
                Z[k] = (best - best.mean()) / best.std()
                raw[k] = sims
            pids = list(self.S_pids)
            for x in exclude:                  # evaluation: leave a paper out
                if x in self.S_pids:
                    for k in keys:
                        Z[k][self.S_pids.index(x)] = -9
            starts, counts = self.S_start, self.S_count
            groups = [(k,) for k in keys] + [c for r in range(2, len(keys) + 1) for c in combinations(keys, r)]
            # stage 1: a shortlist per group (each part alone, each pair, all three)
            shortlist = {}
            for g in groups:
                # rank by the average part score: one oddly phrased part shouldn't sink a paper
                # that matches the others well (the reranker checks every part afterwards)
                score = np.mean([Z[k] for k in g], axis=0)
                idx = np.argsort(-score)[:self.SHORTLIST if len(g) > 1 else self.SHORTLIST_SINGLE]
                shortlist[g] = [int(i) for i in idx if score[i] > self.ASPECT_Z_CANDIDATE]
            cand = sorted({i for v in shortlist.values() for i in v})
        # stage 2: for each part, rerank each candidate's few sentences most similar to that part
        sents = {i: embeddings.split_sentences(self.papers[pids[i]]["abstract"]) for i in cand}
        R, EV = {}, {}
        for k in keys:
            flat = []
            for i in cand:
                a, n = starts[i], counts[i]
                for j in np.argsort(-raw[k][a:a + n])[:self.SENTS_PER_PART]:
                    if j < len(sents[i]):
                        flat.append((i, sents[i][j]))
            sc = self.reranker.score(parts[k], [s for _, s in flat])
            for (i, s), v in zip(flat, sc):
                if v > R.get((k, i), -1e9):
                    R[(k, i)], EV[(k, i)] = float(v), s

        def card(i, g):
            c = self._card(pids[i])
            c["evidence"] = {k: EV[(k, i)] for k in g}
            c["relevance"] = {k: round(R[(k, i)], 2) for k in g}
            lo = min(c["relevance"].values())
            c["strength"] = "strong" if lo > r_str else "possible" if lo > r_pos else "below"
            return c, lo

        out = {}
        for g in groups:
            scored = sorted((card(i, g) for i in shortlist[g]), key=lambda x: -x[1])
            hits = [c for c, lo in scored if lo > r_pos]
            out[g] = {"parts": list(g), "count": len(hits), "strong": sum(c["strength"] == "strong" for c in hits),
                      # the shortlist limits how many can be confirmed; mostly-hits means "at least"
                      "capped": len(shortlist[g]) == self.SHORTLIST and len(hits) >= 0.8 * self.SHORTLIST and len(g) > 1,
                      "papers": hits[:top], "closest": [] if hits else [c for c, _ in scored[:top]]}
        # single parts: an embedding-level estimate of how many papers relate to each part;
        # confirmed counts are capped by the shortlist
        singles = {k: dict(out[(k,)], text=parts[k], estimate=int((Z[k] > 2.1).sum())) for k in keys}
        combos = [out[g] for g in groups if len(g) > 1]
        full = combos[-1]
        n_all, n_strong = full["count"], full["strong"]
        pairs = [c for c in combos if len(c["parts"]) == 2]
        plus = lambda c: f"{c['count']}{'+' if c['capped'] else ''}"
        if n_strong >= 1:
            verdict = ("combined", f"{plus(full)} paper{'s' if n_all > 1 else ''} combine all of these"
                       f" ({n_strong} clearly). Read them before committing.")
        elif n_all > 0:
            verdict = ("possible", f"{n_all} paper{'s' if n_all > 1 else ''} might combine all of these (possible "
                       "matches, not certain). Check the quoted sentences below.")
        elif all(singles[k]["count"] > 0 for k in keys) and any(c["count"] for c in pairs):
            done = [c for c in pairs if c["count"]]
            verdict = ("new_combination", "No paper in the tree combines all of these, though "
                       + "; ".join(f"{' + '.join(c['parts'])} appear together in {plus(c)}" for c in done)
                       + ". The new part is the combination.")
        elif all(singles[k]["count"] > 0 for k in keys):
            verdict = ("new_combination", "Each part has been studied, but never together in the tree.")
        else:
            missing = [k for k in keys if singles[k]["count"] == 0]
            verdict = ("unstudied_part", f"Nothing in the tree clearly matches your {' and '.join(missing)}: "
                       "possibly new, possibly outside what the tree covers (" + config.COVERAGE + ").")
        return {"parts": parts, "thresholds": {"possible": r_pos, "strong": r_str, "shortlist": self.SHORTLIST},
                "singles": singles, "combos": combos, "verdict": {"kind": verdict[0], "text": verdict[1]}}

    # ------------------------------------------------------------ lineage
    def _lin_node(self, pid, **extra):
        p = self.papers[pid]
        n = self.model.nodes.get(p.get("node"), {})
        return {"id": pid, "title": p["title"], "announced": p["announced"], "branch": p.get("branch"),
                "node": p.get("node"), "topic": n.get("label"), "built_on": len(self.cited_by.get(pid, ())),
                "builds_on": len(self.cites.get(pid, ())), "refs_known": pid in self.refs_known, **extra}

    def _edges(self, ids):
        """Edges s -> t (s cites t). `main` marks each paper's single most related reference
        in view, which turns the hairball into a readable line of descent."""
        ids = set(ids)
        out = []
        for a in ids:
            cited = [b for b in self.cites.get(a, ()) if b in ids]
            if not cited:
                continue
            xa = self.X[self.row[a]]
            main = max(cited, key=lambda b: float(self.X[self.row[b]] @ xa))
            out.extend({"s": a, "t": b, "main": b == main} for b in cited)
        return out

    def _lane_of(self, pid, nid):
        """Swimlane: the sub-topic of `nid` the paper sits in, or its branch if it is outside."""
        p = self.papers[pid]
        cur = p.get("node")
        while cur and cur in self.model.nodes:
            parent = self.model.nodes[cur]["parent"]
            if parent == nid:
                return self.model.nodes[cur]["label"]
            if cur == nid:
                return self.model.nodes[nid]["label"]
            cur = parent
        return self._branch_label(p.get("branch")) if p.get("branch") else "other"

    def lineage_node(self, nid, max_inside=160, max_outside=70, newest=25):
        """Citation lineage around a topic, including papers from other branches it is
        intertwined with. Edges point from the citing (newer) to the cited (older) paper."""
        with self.lock:
            if nid not in self.model.nodes:
                return None
            members = set(self._members(nid))
            def internal(p):
                return len(self.cites.get(p, set()) & members) + len(self.cited_by.get(p, set()) & members)
            def external(p):
                return len(self.cites.get(p, ())) + len(self.cited_by.get(p, ()))
            # which papers to draw: those taking part in lineage inside the topic, then any lineage,
            # plus the newest papers (often too new to have been built on)
            ranked = sorted(members, key=lambda p: (-internal(p), -external(p), -self.papers[p]["announced"]))
            chosen = [p for p in ranked if external(p) > 0][:max_inside]
            for p in sorted(members, key=lambda p: -self.papers[p]["announced"])[:newest]:
                if p not in chosen:
                    chosen.append(p)
            chosen_set = set(chosen)
            outside = Counter()
            for p in chosen:
                for q in self.cites.get(p, set()) | self.cited_by.get(p, set()):
                    if q not in members:
                        outside[q] += 1
            out_ids = [q for q, _ in outside.most_common(max_outside)]
            nodes = [self._lin_node(p, inside=True, lane=self._lane_of(p, nid)) for p in chosen] + \
                    [self._lin_node(q, inside=False, lane=self._lane_of(q, nid)) for q in out_ids]
            with_refs = sum(1 for p in members if p in self.refs_known)
            return {"node": nid, "label": self.model.nodes[nid]["label"], "path": self.path(nid),
                    "nodes": nodes, "edges": self._edges(chosen_set | set(out_ids)),
                    "coverage": {"papers": len(members), "with_references": with_refs,
                                 "shown_inside": len(chosen), "shown_outside": len(out_ids)}}

    def lineage_paper(self, pid, up=3, down=2, per_level=10):
        """A paper's ancestry (what it builds on) and descendants (what built on it).
        At each level the most textually related papers are kept, so hubs that everyone
        cites don't swamp the picture."""
        with self.lock:
            if pid not in self.papers:
                return None
            x = self.X[self.row[pid]]
            def related(ids):
                return sorted(ids, key=lambda q: -float(self.X[self.row[q]] @ x))
            levels, seen = {pid: 0}, {pid}
            frontier = [pid]
            for lvl in range(1, up + 1):
                nxt = related({q for f in frontier for q in self.cites.get(f, ())} - seen)[:per_level]
                for q in nxt:
                    levels[q] = -lvl
                seen.update(nxt)
                frontier = nxt
            frontier = [pid]
            for lvl in range(1, down + 1):
                nxt = related({q for f in frontier for q in self.cited_by.get(f, ())} - seen)[:per_level * 2]
                for q in nxt:
                    levels[q] = lvl
                seen.update(nxt)
                frontier = nxt
            parents = related(self.cites.get(pid, ()))
            home = self.papers[pid].get("node")
            nodes = [self._lin_node(q, level=levels[q], inside=self.papers[q].get("node") == home,
                                    lane=("this topic" if self.papers[q].get("node") == home else
                                          self._branch_label(self.papers[q].get("branch"))))
                     for q in seen]
            return {"paper": self._card(pid, abstract_chars=1200), "path": self.path(self.papers[pid].get("node")),
                    "nodes": nodes, "edges": self._edges(seen),
                    "builds_on": [self._card(q) for q in parents[:12]],
                    "built_on_by": [self._card(q) for q in sorted(self.cited_by.get(pid, ()),
                                                                 key=lambda q: -self.papers[q]["announced"])[:12]],
                    "refs_total": self.papers[pid].get("refs_total"), "refs_source": self.papers[pid].get("refs_source")}

    def add_signal(self, nid, kind, who, actor, text, visibility):
        if nid not in self.model.nodes:
            raise KeyError(nid)
        if kind not in SIGNAL_KINDS:
            raise ValueError(f"kind must be one of {sorted(SIGNAL_KINDS)}")
        sid = self.store.add_signal(nid, kind, (who or "anonymous")[:60], actor if actor in ("human", "agent") else "human",
                                    (text or "")[:2000], "private" if visibility == "private" else "public")
        self.broadcast({"type": "signal", "node": nid, "kind": kind})
        return sid

    def status_json(self):
        nxt = ingest.next_announcement()
        last = ingest.last_announcement()
        now = time.time()
        latest = [p for p in self.papers.values() if p["announced"] >= last.timestamp() - 60] if hasattr(self, "papers") else []
        live = [p for p in latest if p["source"] in LIVE_SOURCES]
        lag = sorted(p["first_seen"] - p["announced"] for p in live)
        return {**self.status, "papers": len(getattr(self, "papers", {})),
                "next_announcement": nxt.timestamp(), "last_announcement": last.timestamp(),
                "in_latest_announcement": len(latest), "hot_window": ingest.in_hot_window(),
                "median_lag_s": lag[len(lag) // 2] if lag else None,
                "built_at": self.store.get_meta("built_at"), "now": now,
                "field": config.FIELD_NAME, "coverage": config.COVERAGE, "continuous": ingest.CONTINUOUS}
