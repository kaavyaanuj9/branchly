"""Combination check on short, user-style phrases (evals/aspects_phrases.json).

Each entry describes a real paper in a user's own words. Found: the check lists that paper as
combining all three parts (it exists, so it must be found). Shuffled: problem, method and
setting from three different papers, which should match nothing. Compares the embedding-only
rule (all parts z > bar) with the reranker rule (weakest part's reranker score > cutoff).

    .venv/bin/python evals/aspects_phrases_eval.py
"""
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import Engine  # noqa: E402

ITEMS = json.loads((Path(__file__).parent / "aspects_phrases.json").read_text())


def run(e, parts, target=None):
    r = e.aspects(parts, top=e.SHORTLIST, rerank_possible=-1e9)
    full = r["combos"][-1]["papers"]
    zs = {p["id"]: p for p in full}
    # embedding rule needs z: recompute for the shortlisted papers
    keys = list(parts)
    Q = e.embedder.embed([parts[k] for k in keys])
    Z = []
    for q in Q:
        best, _ = e._aspect_scores(q)
        Z.append((best - best.mean()) / best.std())
    zmin = np.minimum.reduce(Z)
    row = {pid: i for i, pid in enumerate(e.S_pids)}
    rel = {p["id"]: min(p["relevance"].values()) for p in full}
    return rel, zmin, row


def main():
    e = Engine(log=lambda *a: None)
    e.ensure_built()
    while e.reranker is None:
        time.sleep(1)
    rows_found, rows_fake, secs = [], [], []
    n = len(ITEMS)
    for i, it in enumerate(ITEMS):
        parts = {k: it[k] for k in ("problem", "method", "setting")}
        t0 = time.time()
        rel, zmin, row = run(e, parts)
        secs.append(time.time() - t0)
        rows_found.append((rel.get(it["id"], -1e9), float(zmin[row[it["id"]]])))
        fake = {"problem": it["problem"], "method": ITEMS[(i + 4) % n]["method"], "setting": ITEMS[(i + 8) % n]["setting"]}
        rel_f, zmin_f, _ = run(e, fake)
        rows_fake.append((max(rel_f.values(), default=-1e9), float(zmin_f.max())))
        print(f"{it['id']}: target rel {rows_found[-1][0]:7.2f}  z {rows_found[-1][1]:5.2f} | fake best rel {rows_fake[-1][0]:7.2f}  z {rows_fake[-1][1]:5.2f}", flush=True)
    fr, fz = np.array(rows_found).T
    kr, kz = np.array(rows_fake).T
    print(f"\n{n} papers described in short phrases; median check time {np.median(secs):.1f}s\n")
    print("embedding-only rule (all parts z > bar):")
    for t in (1.5, 2.0, 2.1, 2.5):
        print(f"  z > {t}: target found {(fz > t).mean():5.0%} | shuffled finds something {(kz > t).mean():5.0%}")
    print("reranker rule (weakest part > cutoff), among the shortlist:")
    for c in (-6, -4, -2, 0):
        print(f"  > {c:>3}: target found {(fr > c).mean():5.0%} | shuffled finds something {(kr > c).mean():5.0%}")


if __name__ == "__main__":
    main()
