"""Does the reading list surface what authors actually needed to read?

For recent papers with at least 5 references inside the tree, turn each into a short idea
(title + first sentence), build a reading list using only papers public before it, and
measure how many of the papers it really cites are on the list. Baseline: plain
similarity search returning the same number of papers.

    .venv/bin/python evals/reading_eval.py [--n 300] [--seeds 30]
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import Engine, _idea_text  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--seeds", type=int, default=50)
    ap.add_argument("--days", type=int, default=45)
    ap.add_argument("--found", type=int, default=11)
    ap.add_argument("--close", type=int, default=5)
    ap.add_argument("--new", type=int, default=4)
    ap.add_argument("--sample-seed", type=int, default=1, help="change to tune on a different sample")
    args = ap.parse_args()

    e = Engine(log=lambda *a: None)
    e.ensure_built()
    for _ in range(600):                     # neural vectors load in a background thread
        if e.E is not None and len(e.E_row) >= len(e.papers):
            break
        time.sleep(1)
    now = time.time()
    pool = [p for p, d in e.papers.items()
            if d["announced"] > now - args.days * 86400 and len(e.cites.get(p, ())) >= 5]
    rng = np.random.default_rng(args.sample_seed)
    test = list(rng.choice(pool, size=min(args.n, len(pool)), replace=False))

    name, M, ids = e._search_space("auto")
    ann = np.array([e.papers[i]["announced"] for i in ids])
    tot = {"list": [0, 0, 0], "baseline": [0, 0, 0]}   # hits, recall sum, found count
    by_section = {"foundations": 0, "closest": 0, "newest": 0}
    sizes = []
    for p in test:
        refs = e.cites[p]
        t = e.papers[p]["announced"]
        idea = _idea_text(e.papers[p])
        r = e.reading_list(idea, seeds=args.seeds, before=t, n_found=args.found,
                           n_close=args.close, n_new=args.new)
        got = r["ids"]
        K = len(got)
        sizes.append(K)
        sims = M @ e._query_vec(name, idea)
        sims[ann >= t] = -9
        base = [ids[i] for i in np.argsort(-sims)[:K]]
        for key, lst in (("list", got), ("baseline", base)):
            f = len(set(lst) & refs)
            tot[key][0] += f > 0
            tot[key][1] += f / min(len(refs), max(K, 1))
            tot[key][2] += f
        for sec, cards in r["sections"].items():
            by_section[sec] += sum(c["id"] in refs for c in cards)

    n = len(test)
    print(f"\n{n} recent papers as ideas; lists use only papers public before each one")
    print(f"average list length: {np.mean(sizes):.1f} papers (baseline returns the same number)\n")
    print(f"{'':<34}{'similarity only':>16}{'reading list':>14}")
    print(f"{'≥1 actually-cited paper on list':<34}{tot['baseline'][0] / n:>16.1%}{tot['list'][0] / n:>14.1%}")
    print(f"{'share of its citations covered':<34}{tot['baseline'][1] / n:>16.1%}{tot['list'][1] / n:>14.1%}")
    print(f"{'cited papers found per list':<34}{tot['baseline'][2] / n:>16.2f}{tot['list'][2] / n:>14.2f}")
    print(f"\ncited papers found, by section: {by_section}")


if __name__ == "__main__":
    main()
