"""Backfill + grow the tree without starting the server.

    python3 build.py              # first run: backfill from arXiv, then grow
    python3 build.py --rebuild    # re-grow from stored papers (keeps node ids where possible)
    python3 build.py --print      # show the tree
    python3 build.py --history    # add papers back to Oct 2022 (resumable), then fetch references
    python3 build.py --refs       # fetch missing references from Semantic Scholar
    python3 build.py --html-refs  # day-0 reference parser (arXiv HTML / bioRxiv JATS) for papers with none
    python3 build.py --foundations  # biology: add the published papers the preprints cite (>= 2 times)

Select the field with RT_FIELD (default llm_agents), e.g. RT_FIELD=cancer_cell_bio.
"""
import sys
import time

import source as ingest          # the field's literature source (arXiv or bioRxiv)

from engine import Engine


def show(d, indent=0):
    tag = f"{d['count']:5d} papers  +{d.get('n7', 0):3d}/7d  x{d.get('momentum', 0):.2f}"
    print(f"{tag}  {'  ' * indent}{d['label']}" + (f"   [{', '.join(d['keywords'][:4])}]" if d.get("keywords") else ""))
    for c in d.get("children", []):
        show(c, indent + 1)


def history(store):
    done = set(store.get_meta("history_done", []))
    this_month = time.strftime("%Y-%m", time.gmtime())

    def on_month(key, papers):
        n = store.add_papers(papers, "history")
        if key != this_month:
            done.add(key)
            store.set_meta("history_done", sorted(done))
        print(f"    +{n} new  (total {store.count()})", flush=True)

    ingest.backfill_history(done=done, on_month=on_month, log=lambda m: print(m, flush=True))


def html_refs(store):
    """Day-0 parser applied to the back catalogue: papers Semantic Scholar has no references for.
    Pauses around arXiv releases so the live poller has the rate limit to itself."""
    from datetime import datetime, timezone

    import refs
    rows = store.conn.execute("SELECT id, title FROM papers").fetchall()
    titles = refs.TitleIndex({r[0]: {"title": r[1]} for r in rows})
    todo = [r[0] for r in store.conn.execute(
        "SELECT id FROM papers WHERE refs_source='none' ORDER BY announced DESC")]
    print(f"{len(todo)} papers without references", flush=True)
    found = 0
    for n, pid in enumerate(todo, 1):
        while not ingest.CONTINUOUS:   # scheduled sources: stay quiet 30 min before to 90 min after a release
            now = datetime.now(timezone.utc)
            to_next = (ingest.next_announcement(now) - now).total_seconds() / 60
            since_last = (now - ingest.last_announcement(now)).total_seconds() / 60
            if to_next > 30 and since_last > 90:
                break
            print(f"  paused for the arXiv release window ({n - 1}/{len(todo)} done)", flush=True)
            time.sleep(300)
        try:
            res = ingest.day0_refs(pid, titles)
        except Exception as ex:
            print(f"  {pid}: {ex}", flush=True)
            continue
        if res is not None:
            cited, total = res
            if store.set_refs(pid, cited, "html", total):
                found += 1
        else:
            store.conn.execute("UPDATE papers SET refs_fetched=? WHERE id=?", (time.time(), pid))
            store.conn.commit()
        if n % 50 == 0:
            print(f"  {n}/{len(todo)} checked, {found} with references", flush=True)
    print(f"done: {found}/{len(todo)} papers got references from arXiv HTML", flush=True)


if __name__ == "__main__":
    if "--foundations" in sys.argv:
        import refs
        from fields import FIELD
        from store import Store
        refs.fetch_foundations(Store(), min_cites=getattr(FIELD, "FOUNDATION_MIN_CITES", 2),
                               log=lambda m: print(m, flush=True))
        sys.exit(0)
    if "--html-refs" in sys.argv:
        from store import Store
        html_refs(Store())
        sys.exit(0)
    if "--history" in sys.argv or "--refs" in sys.argv:
        import refs
        from store import Store
        st = Store()
        if "--history" in sys.argv:
            history(st)
        refs.fetch_s2(st, log=lambda m: print(m, flush=True))
        sys.exit(0)
    e = Engine()
    e.ensure_built()
    if "--rebuild" in sys.argv:
        e.rebuild()
    if "--print" in sys.argv or "--rebuild" in sys.argv:
        show(e.tree_json())
