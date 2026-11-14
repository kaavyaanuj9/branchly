"""bioRxiv source: same interface as ingest.py (arXiv), selected by the field profile.

bioRxiv posts preprints continuously through the day (no fixed release time like arXiv), so
the server simply polls every few minutes. The public API gives a posting date, not a time:
papers caught live get "public since" = when we first saw them; history uses the date.

API: https://api.biorxiv.org/details/biorxiv/<from>/<to>/<cursor>?category=<cat>  (100 per page)
Each record carries title, authors, abstract, category, version, date and a JATS XML link,
whose <ref-list> gives the paper's references on the day it appears.
"""
import html as html_lib
import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import config
from fields import FIELD

ETZ = ZoneInfo("America/New_York")
API = "https://api.biorxiv.org/details/biorxiv"
UA = {"User-Agent": "research-tree/0.3 (+https://github.com/kaavyaanuj9/branchly)"}
CONTINUOUS = True            # no release schedule: the UI shows "posts continuously"
POLL_SECONDS = 20 * 60
PAGE = 100                   # the API's fixed page size

_rate_lock = threading.Lock()
_last_call = [0.0]


def _get(url, timeout=60, retries=3, spacing=1.5):
    """Polite GET (bioRxiv's XML host answers 429 to fast clients); backs off on 429/503."""
    for attempt in range(retries + 1):
        with _rate_lock:
            wait = spacing - (time.time() - _last_call[0])
            if wait > 0:
                time.sleep(wait)
            _last_call[0] = time.time()
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as ex:
            if ex.code in (429, 503) and attempt < retries:
                time.sleep(20 * (attempt + 1))
                continue
            raise


def _clean(s):
    return " ".join(html_lib.unescape(re.sub(r"<[^>]+>", " ", s or "")).split())


def _cat_param(cat):
    return cat.replace(" ", "_")


def _record_to_paper(c, announced=None):
    doi = c["doi"].lower()
    day = datetime.strptime(c["date"], "%Y-%m-%d")
    posted = datetime(day.year, day.month, day.day, 12, 0, tzinfo=ETZ).timestamp()
    return {
        "id": doi, "version": int(c.get("version") or 1),
        "title": _clean(c.get("title")), "abstract": _clean(c.get("abstract")),
        "authors": [a.strip() for a in (c.get("authors") or "").split(";") if a.strip()],
        "categories": [c.get("category", "")],
        "published": posted, "updated": posted, "announced": announced or posted,
        "jats": c.get("jatsxml") or "",
    }


def fetch_range(start, end, category, log=None):
    """All records posted in [start, end] (YYYY-MM-DD) for one category, de-duplicated to the
    first version seen; paginates through the API."""
    out, cursor = {}, 0
    while True:
        url = f"{API}/{start}/{end}/{cursor}?" + urllib.parse.urlencode({"category": _cat_param(category)})
        d = json.loads(_get(url))
        coll = d.get("collection") or []
        for c in coll:
            if c.get("category", "").strip().lower() != category:
                continue
            doi = c["doi"].lower()
            if doi not in out or int(c.get("version") or 1) < out[doi]["version"]:
                out[doi] = _record_to_paper(c)
        total = int((d.get("messages") or [{}])[0].get("total") or 0)
        cursor += len(coll)
        if not coll or cursor >= total:
            break
    return list(out.values())


def is_relevant(title, abstract):
    return FIELD.is_relevant(title, abstract)


# ---------------------------------------------------------------- schedule (none)
def next_announcement(now=None):
    now = now or datetime.now(timezone.utc)
    return (now + timedelta(seconds=POLL_SECONDS)).astimezone(ETZ)


def last_announcement(now=None):
    now = (now or datetime.now(timezone.utc)).astimezone(ETZ)
    return datetime(now.year, now.month, now.day, 0, 0, tzinfo=ETZ)


def in_hot_window(now=None):
    return False


# ---------------------------------------------------------------- live + history
def poll_new(known_ids, days=2):
    """Preprints posted today or in the last `days` days that we don't have yet."""
    today = datetime.now(ETZ).date()
    start = (today - timedelta(days=days)).isoformat()
    now = time.time()
    fresh = {}
    for cat in FIELD.BIORXIV_CATEGORIES:
        for p in fetch_range(start, today.isoformat(), cat):
            if p["id"] in known_ids or p["id"] in fresh or p["version"] > 1:
                continue
            if not is_relevant(p["title"], p["abstract"]):
                continue
            p["announced"] = now          # caught live: public since we first saw it
            fresh[p["id"]] = (p, "biorxiv")
    return list(fresh.values())


def backfill(days=config.BACKFILL_DAYS, cap=config.BACKFILL_MAX, log=print):
    """Quick start for an empty tree: the last `days` days."""
    today = datetime.now(ETZ).date()
    start = (today - timedelta(days=days)).isoformat()
    got = []
    for cat in FIELD.BIORXIV_CATEGORIES:
        papers = [p for p in fetch_range(start, today.isoformat(), cat) if is_relevant(p["title"], p["abstract"])]
        log(f"  {cat}: {len(papers)} preprints")
        got.extend(papers)
    return got[:cap]


def backfill_history(start=None, until=None, done=(), on_month=None, log=print):
    """Month by month from the field's HISTORY_START; resumable via `done` / `on_month`."""
    d0 = date.fromisoformat(start or FIELD.HISTORY_START).replace(day=1)
    end = until or datetime.now(ETZ).date()
    while d0 <= end:
        nxt = (d0.replace(day=28) + timedelta(days=4)).replace(day=1)
        key = f"{d0.year:04d}-{d0.month:02d}"
        if key not in done:
            got = {}
            for cat in FIELD.BIORXIV_CATEGORIES:
                for p in fetch_range(d0.isoformat(), (nxt - timedelta(days=1)).isoformat(), cat):
                    if is_relevant(p["title"], p["abstract"]):
                        got.setdefault(p["id"], p)
            log(f"  {key}: {len(got)} preprints")
            if on_month:
                on_month(key, list(got.values()))
        d0 = nxt


def fetch_ids(ids):
    """Landmark lookup: this field's landmarks come from its foundations layer instead."""
    return []


# ---------------------------------------------------------------- day-0 references
def _jats_url(pid):
    d = json.loads(_get(f"{API}/{pid}"))
    coll = d.get("collection") or []
    return coll[-1].get("jatsxml") if coll else None


def day0_refs(pid, title_index, jats_url=None):
    """(cited ids, number of references) from the preprint's JATS XML, or None.
    References resolve by DOI (lower-case, the field's paper id) or by title match."""
    url = jats_url or _jats_url(pid)
    if not url:
        return None
    try:
        xml = _get(url, timeout=90, spacing=3.0).decode("utf-8", "ignore")
    except urllib.error.HTTPError:
        return None
    refs = re.findall(r"<ref[ >].*?</ref>", xml, re.S)
    if not refs:
        return None
    cited = set()
    for r in refs:
        m = re.search(r'<pub-id[^>]*pub-id-type="doi"[^>]*>\s*([^<\s]+)\s*</pub-id>', r)
        if m:
            cited.add(html_lib.unescape(m.group(1)).lower().rstrip("."))
            continue
        t = re.search(r"<article-title[^>]*>(.*?)</article-title>", r, re.S)
        hit = title_index.find(_clean(t.group(1))) if t else None
        if hit:
            cited.add(hit)
    cited.discard(pid)
    return cited, len(refs)
