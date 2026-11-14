"""Which vectors grow the better tree? Scored by citation coherence.

If topics follow real lines of work, papers cite papers in their own topic more often than
chance. For every in-tree citation link we check whether both papers share a leaf topic and a
branch, and divide by the chance rate (sum over groups of (size/N)^2) to get a lift. Citations
are independent of how either tree was built. Nothing is saved.

    .venv/bin/python evals/tree_eval.py
"""
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.preprocessing import normalize

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import embeddings  # noqa: E402
from model import TreeModel  # noqa: E402
from store import Store  # noqa: E402


def coherence(assign, branch, edges, n):
    out = {}
    for name, lab in (("leaf", assign), ("branch", branch)):
        same = np.mean([lab[a] == lab[b] for a, b in edges])
        sizes = np.array(list(Counter(lab.values()).values()), dtype=float)
        chance = float(((sizes / n) ** 2).sum())
        out[name] = (same, same / chance)
    return out


def main():
    st = Store()
    papers = st.all_papers()
    ids = [p["id"] for p in papers]
    idset = set(ids)
    edges = [(a, b) for a, b in st.all_refs() if a in idset and b in idset and a != b]
    print(f"{len(papers)} papers, {len(edges)} in-tree citation links")
    cache_ids, vecs = embeddings.load_cache()
    row = {p: i for i, p in enumerate(cache_ids)}
    neural = vecs[[row[p] for p in ids]].astype(np.float64)

    results = {}
    t = time.time()
    lsa_model = TreeModel()
    asg, _ = lsa_model.fit(papers, log=lambda *a: None)
    results["lsa (current)"] = (lsa_model, asg, time.time() - t)
    lsa_vecs = lsa_model.embed(papers)
    for name, v in (("neural", neural), ("hybrid", normalize(np.hstack([neural, 0.7 * lsa_vecs])))):
        t = time.time()
        m = TreeModel()
        asg, _ = m.fit(papers, log=lambda *a: None, vectors=v)
        results[name] = (m, asg, time.time() - t)

    print(f"\n{'variant':<15}{'topics':>8}{'same topic':>12}{'lift':>7}{'same branch':>13}{'lift':>7}{'fit s':>7}")
    for name, (m, asg, secs) in results.items():
        leaf = {pid: node for pid, _, node in asg}
        br = {pid: b for pid, b, _ in asg}
        c = coherence(leaf, br, edges, len(papers))
        n_leaves = sum(1 for nd in m.nodes.values() if not nd["children"])
        print(f"{name:<15}{n_leaves:>8}{c['leaf'][0]:>12.1%}{c['leaf'][1]:>7.1f}{c['branch'][0]:>13.1%}{c['branch'][1]:>7.1f}{secs:>7.0f}")

    rng = np.random.default_rng(0)
    for name, (m, _, _) in results.items():
        leaves = [nd for nd in m.nodes.values() if not nd["children"]]
        pick = rng.choice(len(leaves), size=8, replace=False)
        print(f"\nsample topics, {name}: " + " | ".join(leaves[i]["label"] for i in pick))


if __name__ == "__main__":
    main()
