"""Does search find the right prior work? LSA vs neural, scored against real citations.

For recent papers that cite at least 3 papers in the tree, turn each into a short "idea"
(title + first sentence), search only the papers that existed before it, and check how
many of the papers it actually cites come back in the top k. Citations are independent of
how the tree was built, so this doesn't favour the method the tree uses.

    .venv/bin/python evals/locate_eval.py [--n 400] [--k 20]
"""
import argparse
import json
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import config  # noqa: E402
import embeddings  # noqa: E402
from model import TreeModel  # noqa: E402

PROBES = [
    "prompt injection defense for web browsing agents",
    "agents that learn reusable skills from their own failed trajectories with RL",
    "multi-agent debate improves factuality",
    "LLM agents negotiating water rights between farming cooperatives",
    "quantum error correction decoder design using coding agents",
]


def idea(p):
    return f"{p['title']}. {p['abstract'].split('. ')[0]}."


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=400)
    ap.add_argument("--k", type=int, default=20)
    ap.add_argument("--days", type=int, default=45)
    args = ap.parse_args()

    db = sqlite3.connect(config.DB_PATH)
    rows = db.execute("SELECT id, title, abstract, announced, node FROM papers").fetchall()
    papers = {r[0]: {"title": r[1], "abstract": r[2], "announced": r[3], "node": r[4]} for r in rows}
    cites = defaultdict(set)
    for a, b in db.execute("SELECT citing, cited FROM refs"):
        if a in papers and b in papers:
            cites[a].add(b)

    ids, E = embeddings.load_cache()
    missing = [p for p in papers if p not in set(ids)]
    if missing:
        sys.exit(f"{len(missing)} papers not embedded yet; run `.venv/bin/python embeddings.py` first")
    order = ids
    row = {p: i for i, p in enumerate(order)}
    ann = np.array([papers[p]["announced"] for p in order])
    tm = TreeModel.load()
    X = tm.embed([papers[p] for p in order]).astype(np.float32)
    emb = embeddings.Embedder()

    now = time.time()
    pool = [p for p in order if papers[p]["announced"] > now - args.days * 86400 and len(cites[p]) >= 3]
    rng = np.random.default_rng(0)
    test = list(rng.choice(pool, size=min(args.n, len(pool)), replace=False))
    queries = [idea(papers[p]) for p in test]
    Q = {"lsa": tm.embed([{"title": q, "abstract": q} for q in queries]).astype(np.float32),
         "neural": emb.embed(queries)}
    M = {"lsa": X, "neural": E}

    res = {}
    for method in ("lsa", "neural"):
        hit = rec = mrr = leaf = 0.0
        for q, p in zip(Q[method], test):
            sims = M[method] @ q
            sims[ann >= papers[p]["announced"]] = -9      # only prior work, never itself
            top = np.argsort(-sims)[:args.k]
            got = [order[i] for i in top]
            cited = cites[p]
            found = [g for g in got if g in cited]
            hit += bool(found)
            rec += len(found) / min(len(cited), args.k)
            first = next((r for r, g in enumerate(got, 1) if g in cited), None)
            mrr += 1 / first if first else 0
            votes = Counter()
            for i in top[:15]:
                if papers[order[i]]["node"]:
                    votes[papers[order[i]]["node"]] += float(sims[i])
            leaf += bool(votes) and votes.most_common(1)[0][0] == papers[p]["node"]
        n = len(test)
        res[method] = {f"hit@{args.k}": round(hit / n, 3), f"recall@{args.k}": round(rec / n, 3),
                       "mrr": round(mrr / n, 3), "same_leaf_as_tree": round(leaf / n, 3)}

    print(f"\n{len(test)} recent papers as ideas (title + first sentence), searching prior work only")
    print(f"{'metric':<22}{'lsa':>10}{'neural':>10}")
    for m in res["lsa"]:
        print(f"{m:<22}{res['lsa'][m]:>10}{res['neural'][m]:>10}")
    print("  hit: at least one actually-cited paper in the top k; recall: share of its citations found;")
    print("  same_leaf_as_tree is biased toward lsa, because the tree was clustered with lsa.\n")

    print("Probes (closest paper per method):")
    PQ = {"lsa": tm.embed([{"title": q, "abstract": q} for q in PROBES]), "neural": emb.embed(PROBES)}
    for i, q in enumerate(PROBES):
        print(f"- {q}")
        for method in ("lsa", "neural"):
            sims = M[method] @ PQ[method][i]
            j = int(np.argmax(sims))
            print(f"    {method:<7}{sims[j]:.2f}  {papers[order[j]]['title'][:80]}")
    Path(config.DATA / "locate_eval.json").write_text(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
