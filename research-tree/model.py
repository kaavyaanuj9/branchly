"""Grow the tree: embed papers, place them under curated branches, split branches
into automatically discovered topics, and name the topics.

Pipeline (all CPU, no API key needed):
  TF-IDF (1-2 grams) -> LSA (TruncatedSVD) -> unit vectors
  branch  = seeded prototypes (keyword weak labels) + keyword prior
  topics  = recursive k-means inside each branch (depth <= 3)
  labels  = class-based TF-IDF phrases (optionally renamed by Claude)
New papers are placed incrementally by descending the tree to the nearest leaf
centroid; a full re-grow happens once enough new papers arrive, and nodes are
matched to the previous tree by membership overlap so ids (and the claims /
dead-end marks attached to them) survive.
"""
import json
import os
import pickle
import re
import secrets

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.preprocessing import normalize

import config

GENERIC = set(ENGLISH_STOP_WORDS) | {
    "agent", "agents", "agentic", "llm", "llms", "large", "language", "model", "models", "large language",
    "language model", "language models", "llm agents", "llm agent", "llm based", "based", "paper", "propose",
    "proposed", "approach", "method", "methods", "framework", "results", "show", "task", "tasks", "using",
    "novel", "performance", "existing", "work", "study", "new", "achieves", "demonstrate", "address",
    "introduce", "however", "challenge", "challenges", "systems", "system", "ai", "data", "multiple",
    "different", "real", "world", "real world", "significantly", "state", "art", "state art", "experiments",
    "outperforms", "baseline", "baselines", "including", "key", "effective", "enables", "github", "com",
    "https", "code", "available", "open", "source", "agents llm", "capabilities", "ability", "abilities",
    "complex", "remains", "despite", "recent", "advances", "propose novel", "end", "end end", "level",
    "high", "llm powered", "powered", "driven", "llm driven", "make", "makes", "making", "use", "used",
    "large scale", "scale", "across", "various", "diverse", "specific", "specifically", "approaches",
    "improve", "improves", "improvement", "improving", "zero", "shot", "zero shot", "models llms",
    "language models llms", "models llm", "agentic ai", "ai agents", "autonomous", "autonomous agents",
    "evaluation", "evaluate", "evaluated", "benchmark", "benchmarks", "agentic systems", "agent systems",
    "llm based agents", "based agents", "llm based", "tool", "tools",
}
MAX_DEPTH = 3
SPLIT_MIN = 60      # don't split nodes smaller than this
MIN_CHILD = 8       # merge clusters smaller than this


def _text(p):
    return f"{p['title']}. {p['title']}. {p['abstract']}"


class TreeModel:
    def __init__(self):
        self.vec = None
        self.svd = None
        self.prototypes = None          # (B, d)
        self.nodes = {}                 # id -> node dict (centroid as list)
        self.space = "lsa"              # which vectors the tree (centroids) lives in
        self.branch_ids = [b["id"] for b in config.BRANCHES]
        self._kw = [[re.compile(k, re.I) for k in b["keywords"]] for b in config.BRANCHES]

    # ---------------------------------------------------------------- features
    def keyword_scores(self, papers):
        K = np.zeros((len(papers), len(self._kw)))
        for i, p in enumerate(papers):
            t, a = p["title"], p["abstract"]
            for j, pats in enumerate(self._kw):
                K[i, j] = sum(3.0 * bool(r.search(t)) + min(len(r.findall(a)), 2) * 0.5 for r in pats)
        return K

    def embed(self, papers):
        return normalize(self.svd.transform(self.vec.transform([_text(p) for p in papers])))

    def branch_scores(self, X, K):
        Kn = K / (K.max(axis=1, keepdims=True) + 1e-9)
        return X @ self.prototypes.T + 0.35 * Kn * (K.max(axis=1, keepdims=True) > 0)

    # ---------------------------------------------------------------- full fit
    LSA_WEIGHT = 0.7   # hybrid space: [neural, 0.7 * lsa]; best citation coherence in evals/tree_eval.py

    def _space_vectors(self, papers, vectors, X_lsa=None):
        X_lsa = self.embed(papers) if X_lsa is None else X_lsa
        if self.space == "lsa":
            return X_lsa
        V = np.asarray(vectors, dtype=np.float64)
        return normalize(np.hstack([V, self.LSA_WEIGHT * X_lsa]) if self.space == "hybrid" else V)

    def fit(self, papers, old=None, log=print, vectors=None, space=None):
        """vectors: optional (n, d) neural vectors. space: "lsa", "neural" or "hybrid" (neural and
        LSA side by side; default when vectors are given). TF-IDF is always fitted for labels,
        keyword priors and the LSA fallback."""
        texts = [_text(p) for p in papers]
        self.vec = TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_df=0.4, stop_words="english",
                                   sublinear_tf=True, max_features=60000,
                                   token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9\-]+\b")
        T = self.vec.fit_transform(texts)
        dims = min(192, T.shape[1] - 1, len(papers) - 1)
        self.svd = TruncatedSVD(n_components=dims, random_state=0)
        X_lsa = normalize(self.svd.fit_transform(T))
        self.space = "lsa" if vectors is None else (space or "hybrid")
        X = self._space_vectors(papers, vectors, X_lsa)
        K = self.keyword_scores(papers)
        log(f"  growing the tree in {self.space} space ({X.shape[1]} dims) for {len(papers)} papers")

        # Seed prototypes from confident keyword matches, then refine twice.
        top = K.argmax(1)
        srt = np.sort(K, axis=1)
        confident = (srt[:, -1] >= 3) & (srt[:, -1] >= 1.5 * srt[:, -2])
        protos = []
        for j in range(len(self.branch_ids)):
            m = confident & (top == j)
            if m.sum() < 5:
                m = top == j
            protos.append(X[m].mean(0) if m.any() else X.mean(0))
        self.prototypes = normalize(np.array(protos))
        for _ in range(2):
            S = self.branch_scores(X, K)
            a = S.argmax(1)
            self.prototypes = normalize(np.array([X[a == j].mean(0) if (a == j).any() else self.prototypes[j]
                                                  for j in range(len(self.branch_ids))]))
        S = self.branch_scores(X, K)
        branch_idx = S.argmax(1)

        # Grow topics inside each branch.
        self.nodes = {}
        terms = np.array(self.vec.get_feature_names_out())
        assignments = [None] * len(papers)
        for j, b in enumerate(config.BRANCHES):
            idx = np.where(branch_idx == j)[0]
            self.nodes[b["id"]] = {"id": b["id"], "parent": "root", "branch": b["id"], "depth": 1,
                                   "label": b["label"], "keywords": [], "children": [],
                                   "centroid": self.prototypes[j].tolist(), "curated": True}
            self._grow(b["id"], idx, X, T, terms, papers, assignments, depth=2)
        self._mark_bridges(S, branch_idx, papers)
        if old is not None:
            mapping = self._inherit_ids(old, papers, assignments)
        else:
            mapping = {}
        self._maybe_llm_labels(papers, assignments, log)
        log(f"  grew {sum(1 for n in self.nodes.values() if not n['children'])} leaf topics "
            f"under {len(config.BRANCHES)} branches")
        return [(papers[i]["id"], self.nodes[assignments[i]]["branch"], assignments[i])
                for i in range(len(papers))], mapping

    def _grow(self, parent, idx, X, T, terms, papers, assignments, depth):
        node = self.nodes[parent]
        if depth > MAX_DEPTH or len(idx) < SPLIT_MIN:
            for i in idx:
                assignments[i] = parent
            return
        k = int(np.clip(round(np.sqrt(len(idx) / 10)), 2, 9))
        km = KMeans(n_clusters=k, n_init=4, random_state=0).fit(X[idx])
        lab = km.labels_.copy()
        # merge tiny clusters into their nearest sibling
        cent = normalize(km.cluster_centers_)
        sizes = np.bincount(lab, minlength=k)
        for c in np.where(sizes < MIN_CHILD)[0]:
            others = [o for o in range(k) if sizes[o] >= MIN_CHILD]
            if not others:
                break
            tgt = others[int(np.argmax(cent[others] @ cent[c]))]
            lab[lab == c] = tgt
        groups = [idx[lab == c] for c in np.unique(lab)]
        if len(groups) < 2:
            for i in idx:
                assignments[i] = parent
            return
        parent_sum = np.asarray(T[idx].sum(0)).ravel()
        for g in groups:
            nid = "t" + secrets.token_hex(3)
            c = normalize(X[g].mean(0, keepdims=True))[0]
            gsum = np.asarray(T[g].sum(0)).ravel()
            rest = (parent_sum - gsum) / max(len(idx) - len(g), 1)
            kws = self._phrases(gsum / len(g), rest, terms)
            central = g[np.argsort(-(X[g] @ c))[:5]]
            self.nodes[nid] = {"id": nid, "parent": parent, "branch": node["branch"], "depth": depth,
                               "label": " · ".join(kws[:2]) if kws else "misc", "keywords": kws[:6],
                               "children": [], "centroid": c.tolist(),
                               "exemplars": [papers[i]["id"] for i in central]}
            node["children"].append(nid)
            child_depth_ok = len(g) >= 2.5 * SPLIT_MIN
            self._grow(nid, g, X, T, terms, papers, assignments, depth + 1 if child_depth_ok else MAX_DEPTH + 1)

    @staticmethod
    def _stem(w):
        for suf, rep in (("ies", "y"), ("ing", ""), ("es", ""), ("s", ""), ("ed", "")):
            if len(w) > 4 and w.endswith(suf):
                return w[: -len(suf)] + rep
        return w

    @classmethod
    def _phrases(cls, inside, rest, terms, n=6):
        """Distinctive phrases: frequent inside the cluster, rare in its siblings."""
        eps = 1e-4
        score = inside * np.log((inside + eps) / (rest + eps))
        out, stems = [], []
        for i in np.argsort(-score)[:120]:
            t = terms[i]
            words = t.split()
            if score[i] <= 0 or t in GENERIC or all(w in GENERIC for w in words):
                continue
            if any(w.isdigit() or len(w) < 3 for w in words):
                continue
            st = {cls._stem(w) for w in words}
            if any(st <= o or o <= st for o in stems):
                continue
            out.append(t)
            stems.append(st)
            if len(out) >= n:
                break
        # lead with a multi-word phrase when one is near the top: it names a topic better
        multi = [t for t in out[:4] if " " in t]
        if multi and " " not in out[0]:
            out.remove(multi[0])
            out.insert(0, multi[0])
        return out

    def _mark_bridges(self, S, branch_idx, papers):
        order = np.argsort(-S, axis=1)
        self.bridges = {}
        for i, p in enumerate(papers):
            a, b = order[i, 0], order[i, 1]
            if S[i, b] >= 0.9 * S[i, a]:
                self.bridges[p["id"]] = self.branch_ids[b]

    def _inherit_ids(self, old, papers, assignments):
        """Give new nodes the id of the old node they mostly continue."""
        old_members = {}
        for p in papers:
            if p.get("node"):
                old_members.setdefault(p["node"], set()).add(p["id"])
        new_members = {}
        for i, p in enumerate(papers):
            nid = assignments[i]
            while nid and nid in self.nodes and not self.nodes[nid].get("curated"):
                new_members.setdefault(nid, set()).add(p["id"])
                nid = self.nodes[nid]["parent"]
        # old leaf membership -> also roll up to old ancestors
        old_full = {}
        for nid, mem in old_members.items():
            cur = nid
            while cur in old.nodes and not old.nodes[cur].get("curated"):
                old_full.setdefault(cur, set()).update(mem)
                cur = old.nodes[cur]["parent"]
        rename, used = {}, set()
        for nid, mem in sorted(new_members.items(), key=lambda kv: -len(kv[1])):
            best, bj = None, 0.3
            for oid, om in old_full.items():
                if oid in used or old.nodes[oid]["depth"] != self.nodes[nid]["depth"]:
                    continue
                j = len(mem & om) / len(mem | om)
                if j > bj:
                    best, bj = oid, j
            if best:
                rename[nid] = best
                used.add(best)
        for new, oldid in rename.items():
            n = self.nodes.pop(new)
            n["id"] = oldid
            self.nodes[oldid] = n
        for n in self.nodes.values():
            n["parent"] = rename.get(n["parent"], n["parent"])
            n["children"] = [rename.get(c, c) for c in n["children"]]
        for i, a in enumerate(assignments):
            assignments[i] = rename.get(a, a)
        # signals on vanished old nodes move to the new node holding most of their papers
        mapping = {}
        for oid, om in old_full.items():
            if oid in self.nodes:
                continue
            best, bo = None, 0
            for nid, mem in new_members.items():
                o = len(om & mem)
                if o > bo or (o == bo and best and len(mem) < len(new_members[best])):
                    best, bo = nid, o
            if best:
                mapping[oid] = rename.get(best, best)
        return mapping

    def _maybe_llm_labels(self, papers, assignments, log):
        if not os.environ.get("ANTHROPIC_API_KEY"):
            return
        try:
            import anthropic
        except ImportError:
            log("  (ANTHROPIC_API_KEY set but `anthropic` not installed; keeping keyword labels)")
            return
        client = anthropic.Anthropic()
        by_id = {p["id"]: p for p in papers}
        for b in config.BRANCHES:
            topics = [n for n in self.nodes.values() if n["branch"] == b["id"] and not n.get("curated")]
            if not topics:
                continue
            listing = "\n".join(
                f"[{n['id']}] keywords: {', '.join(n['keywords'])}\n  papers: "
                + " | ".join(by_id[e]["title"] for e in n.get("exemplars", []) if e in by_id)
                for n in topics)
            prompt = (f"These are automatically discovered topic clusters inside the research branch "
                      f"'{b['label']}' of a map of LLM-agent papers. Give each a precise 2-5 word name an "
                      f"expert would recognise (no generic words like 'LLM agents'). Reply with only a JSON "
                      f"object mapping each id to its name.\n\n{listing}")
            try:
                resp = client.beta.messages.create(
                    model=config.LLM_LABEL_MODEL, max_tokens=4000,
                    output_config={"effort": "low"},
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default",
                    messages=[{"role": "user", "content": prompt}])
                if resp.stop_reason == "refusal":
                    continue
                text = "".join(getattr(c, "text", "") for c in resp.content)
                names = json.loads(text[text.find("{"): text.rfind("}") + 1])
                for nid, name in names.items():
                    if nid in self.nodes and isinstance(name, str) and name.strip():
                        self.nodes[nid]["label"] = name.strip()
            except Exception as ex:
                log(f"  LLM labelling skipped for {b['id']}: {ex}")

    # ---------------------------------------------------------------- incremental
    def place(self, papers, vectors=None):
        """Return [(paper_id, branch, leaf_node, bridge_branch_or_None)] for new papers.
        A tree grown in neural space needs the papers' neural vectors."""
        if not papers:
            return []
        if self.space != "lsa" and vectors is None:
            raise ValueError(f"this tree was grown in {self.space} space: pass the papers' neural vectors")
        X = self._space_vectors(papers, vectors)
        S = self.branch_scores(X, self.keyword_scores(papers))
        out = []
        for i, p in enumerate(papers):
            order = np.argsort(-S[i])
            bid = self.branch_ids[order[0]]
            nid = bid
            while self.nodes[nid]["children"]:
                kids = self.nodes[nid]["children"]
                C = np.array([self.nodes[k]["centroid"] for k in kids])
                nid = kids[int(np.argmax(C @ X[i]))]
            bridge = self.branch_ids[order[1]] if S[i, order[1]] >= 0.9 * S[i, order[0]] else None
            if bridge:
                self.bridges[p["id"]] = bridge
            out.append((p["id"], bid, nid, bridge))
        return out

    def lsa_vec(self, text):
        """TF-IDF/LSA vector for free text (keyword-based search fallback)."""
        return self.embed([{"title": text, "abstract": text}])[0]

    # ---------------------------------------------------------------- persistence
    def save(self, path=config.MODEL_PATH):
        with open(path, "wb") as f:
            pickle.dump(self.__dict__ | {"_kw": None}, f)

    @classmethod
    def load(cls, path=config.MODEL_PATH):
        m = cls()
        with open(path, "rb") as f:
            state = pickle.load(f)
        state.pop("_kw", None)
        m.__dict__.update(state)
        return m
