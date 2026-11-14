"""arXiv ingestion: backfill via the API, then low-latency polling (API + RSS).

"Public" for an arXiv paper means the moment it is announced (Sun-Thu 20:00
America/New_York). The API only reports v1 submission time, so we derive the
announcement slot from arXiv's published schedule; the RSS feed carries the
announcement date directly.
"""
import html as html_lib
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

import config

ETZ = ZoneInfo("America/New_York")
ATOM = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
API = "https://export.arxiv.org/api/query"
UA = {"User-Agent": "research-tree-demo/0.1 (local prototype)"}

_llm_re = re.compile(config.LLM_PATTERN, re.I)
_agent_re = re.compile(config.AGENT_PATTERN, re.I)
_rate_lock = threading.Lock()
_last_call = [0.0]


PAGE = 50   # arXiv answers 429 to larger pages (observed 2026-10-04: 50 ok, 200 refused)


def _get(url, timeout=60, retries=3):
    """arXiv asks for at most one request every 3 seconds; on 429 back off and retry."""
    for attempt in range(retries + 1):
        with _rate_lock:
            wait = 3.1 - (time.time() - _last_call[0])
            if wait > 0:
                time.sleep(wait)
            _last_call[0] = time.time()
        req = urllib.request.Request(url, headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as ex:
            if ex.code in (429, 503) and attempt < retries:
                time.sleep(15 * (attempt + 1))
                continue
            raise


# ---- arXiv schedule ----------------------------------------------------------
def announcement_for(submitted_utc: datetime) -> datetime:
    """Announcement time for a v1 submitted at `submitted_utc` (ignores holidays).

    Submissions close 14:00 ET Mon-Fri; a window closing Mon-Thu is announced the
    same day at 20:00 ET, the Friday window is announced Sunday 20:00 ET.
    """
    s = submitted_utc.astimezone(ETZ)
    d = s.date()
    if s.weekday() >= 5 or s.hour >= 14:
        d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    if d.weekday() == 4:
        d += timedelta(days=2)
    return datetime(d.year, d.month, d.day, 20, 0, tzinfo=ETZ)


def next_announcement(now=None) -> datetime:
    now = (now or datetime.now(timezone.utc)).astimezone(ETZ)
    d = now.date()
    for _ in range(8):
        slot = datetime(d.year, d.month, d.day, 20, 0, tzinfo=ETZ)
        if d.weekday() in (6, 0, 1, 2, 3) and slot > now:
            return slot
        d += timedelta(days=1)
    return slot


def last_announcement(now=None) -> datetime:
    now = (now or datetime.now(timezone.utc)).astimezone(ETZ)
    d = now.date()
    for _ in range(8):
        slot = datetime(d.year, d.month, d.day, 20, 0, tzinfo=ETZ)
        if d.weekday() in (6, 0, 1, 2, 3) and slot <= now:
            return slot
        d -= timedelta(days=1)
    return slot


def in_hot_window(now=None) -> bool:
    now = (now or datetime.now(timezone.utc)).astimezone(ETZ)
    lo, hi = config.HOT_WINDOW_MIN
    for slot in (next_announcement(now), last_announcement(now)):
        delta = (now - slot).total_seconds() / 60
        if lo <= delta <= hi:
            return True
    return False


# ---- parsing -------------------------------------------------------------------
def _clean(s):
    return " ".join((s or "").split())


def is_relevant(title, abstract):
    text = f"{title} {abstract}"
    return bool(_agent_re.search(text)) and bool(_llm_re.search(text))


def _split_id(raw):
    raw = raw.rsplit("/abs/", 1)[-1]
    m = re.match(r"(.+?)v(\d+)$", raw)
    return (m.group(1), int(m.group(2))) if m else (raw, 1)


def parse_atom(xml_bytes):
    root = ET.fromstring(xml_bytes)
    out = []
    for e in root.findall("a:entry", ATOM):
        pid, ver = _split_id(e.findtext("a:id", "", ATOM))
        title = _clean(e.findtext("a:title", "", ATOM))
        abstract = _clean(e.findtext("a:summary", "", ATOM))
        published = datetime.fromisoformat(e.findtext("a:published", "", ATOM).replace("Z", "+00:00"))
        updated = datetime.fromisoformat(e.findtext("a:updated", "", ATOM).replace("Z", "+00:00"))
        out.append({
            "id": pid, "version": ver, "title": title, "abstract": abstract,
            "authors": [_clean(a.findtext("a:name", "", ATOM)) for a in e.findall("a:author", ATOM)],
            "categories": [c.get("term") for c in e.findall("a:category", ATOM)],
            "published": published.timestamp(), "updated": updated.timestamp(),
            "announced": announcement_for(published).timestamp(),
        })
    return out


def fetch_api(start=0, max_results=PAGE, query=config.ARXIV_QUERY, retries=3):
    params = {"search_query": query, "sortBy": "submittedDate", "sortOrder": "descending",
              "start": start, "max_results": max_results}
    return parse_atom(_get(API + "?" + urllib.parse.urlencode(params), retries=retries))


def fetch_ids(ids):
    params = {"id_list": ",".join(ids), "max_results": len(ids)}
    return parse_atom(_get(API + "?" + urllib.parse.urlencode(params)))


def fetch_rss():
    """New + cross-listed papers from the latest daily announcement."""
    root = ET.fromstring(_get(config.RSS_URL))
    out = []
    for it in root.iter("item"):
        kind = it.findtext("{http://arxiv.org/schemas/atom}announce_type", "")
        if kind not in ("new", "cross"):
            continue
        pid, ver = _split_id(it.findtext("link", ""))
        desc = it.findtext("description", "")
        abstract = _clean(desc.split("Abstract:", 1)[-1])
        title = _clean(it.findtext("title", ""))
        listing = parsedate_to_datetime(it.findtext("pubDate"))
        # Listing date D is announced at 20:00 ET the evening before.
        ld = listing.astimezone(ETZ).date() - timedelta(days=1)
        announced = datetime(ld.year, ld.month, ld.day, 20, 0, tzinfo=ETZ).timestamp()
        out.append({
            "id": pid, "version": ver, "title": title, "abstract": abstract,
            "authors": [a.strip() for a in it.findtext("{http://purl.org/dc/elements/1.1/}creator", "").split(",") if a.strip()],
            "categories": [c.text for c in it.findall("category")],
            "published": announced, "updated": announced, "announced": announced,
        })
    return out


# ---- high-level ----------------------------------------------------------------
def backfill(days=config.BACKFILL_DAYS, cap=config.BACKFILL_MAX, page=PAGE, log=print):
    cutoff = time.time() - days * 86400
    got, start, empty = [], 0, 0
    while len(got) < cap:
        try:
            batch = fetch_api(start=start, max_results=page)
        except Exception as ex:  # transient arXiv errors are common
            log(f"  arXiv error at {start}: {ex}; retrying")
            time.sleep(5)
            continue
        if not batch:
            empty += 1
            if empty >= 3:
                break
            continue
        empty = 0
        start += len(batch)
        got.extend(p for p in batch if is_relevant(p["title"], p["abstract"]))
        log(f"  fetched {start} entries, kept {len(got)} (oldest {datetime.fromtimestamp(batch[-1]['published']):%Y-%m-%d})")
        if batch[-1]["published"] < cutoff:
            break
    return [p for p in got if p["published"] >= cutoff]


def backfill_history(start="2022-10", until=None, page=PAGE, done=(), on_month=None, log=print):
    """Month-by-month history so offsets stay small; resumable via `done` / `on_month`."""
    y, m = map(int, start.split("-"))
    until = until or datetime.now(timezone.utc)
    while datetime(y, m, 1, tzinfo=timezone.utc) < until:
        ny, nm = (y + (m == 12), m % 12 + 1)
        key = f"{y:04d}-{m:02d}"
        if key not in done:
            q = f"{config.ARXIV_QUERY} AND submittedDate:[{y:04d}{m:02d}010000 TO {ny:04d}{nm:02d}010000]"
            got, offset, tries, errors = [], 0, 0, 0
            while True:
                try:
                    batch = fetch_api(start=offset, max_results=page, query=q)
                    errors = 0
                except Exception as ex:
                    errors += 1
                    wait = min(300, 10 * 2 ** errors)
                    log(f"  {key}: arXiv error {ex}; retrying in {wait}s")
                    time.sleep(wait)
                    continue
                if not batch:
                    tries += 1
                    if tries < 3:
                        time.sleep(5)
                        continue   # arXiv sometimes returns a transient empty page
                    break
                tries = 0
                offset += len(batch)
                got.extend(p for p in batch if is_relevant(p["title"], p["abstract"]))
                if len(batch) < page:
                    break
            log(f"  {key}: {offset} fetched, {len(got)} kept")
            if on_month:
                on_month(key, got)
        y, m = ny, nm


# ---------------------------------------------------------------- listing pages (primary)
# arxiv.org/list/<cat>/new is arXiv's own "new submissions" page: it changes at the 20:00 ET
# release, carries title/authors/abstract, and stayed reachable when the API was throttling.
_LIST_DATE = re.compile(r"Showing new listings for \w+, (\d{1,2} \w+ \d{4})")
_state = {"listing_date": None, "last_full": 0.0, "last_api": 0.0}


def _strip_tags(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return _clean(html_lib.unescape(s))


def fetch_listing(cat):
    """(listing date string, papers) for the new + cross-listed entries of one category."""
    page = _get(f"https://arxiv.org/list/{cat}/new?skip=0&show=2000").decode("utf-8", "ignore")
    m = _LIST_DATE.search(page)
    if not m:
        return None, []
    day = datetime.strptime(m.group(1), "%d %B %Y").date()
    # the listing for day D is announced at 20:00 ET the evening before (Friday's for Monday is Sunday)
    prev = day - timedelta(days=1)
    announced = datetime(prev.year, prev.month, prev.day, 20, 0, tzinfo=ETZ).timestamp()
    body = page.split("Replacement submissions")[0]          # replacements are not new papers
    out = []
    for dt, dd in re.findall(r"<dt>(.*?)</dt>\s*<dd>(.*?)</dd>", body, re.S):
        idm = re.search(r'href ?="/abs/([^"]+)"', dt)
        if not idm:
            continue
        pid, ver = _split_id(idm.group(1))
        title = re.search(r"list-title[^>]*>(.*?)</div>", dd, re.S)
        authors = re.search(r"list-authors'>(.*?)</div>", dd, re.S)
        subjects = re.search(r"list-subjects'>(.*?)</div>", dd, re.S)
        abstract = re.search(r"<p class='mathjax'>(.*?)</p>", dd, re.S)
        if not (title and abstract):
            continue
        out.append({
            "id": pid, "version": ver,
            "title": _strip_tags(title.group(1)).removeprefix("Title:").strip(),
            "abstract": _strip_tags(abstract.group(1)),
            "authors": [a.strip() for a in _strip_tags(authors.group(1)).split(",")] if authors else [],
            "categories": re.findall(r"\((\w+\.\w+)\)", subjects.group(1)) if subjects else [cat],
            "published": announced, "updated": announced, "announced": announced,
        })
    return m.group(1), out


def poll_listings(known_ids, force=False):
    """Cheap check of one listing's date; fetch every category only when a new release is out
    (or every 30 minutes as a safety net)."""
    date, first = fetch_listing(config.CATEGORIES[0])
    if not force and date == _state["listing_date"] and time.time() - _state["last_full"] < 1800:
        return []
    found = {p["id"]: p for p in first}
    for cat in config.CATEGORIES[1:]:
        _, papers = fetch_listing(cat)
        for p in papers:
            found.setdefault(p["id"], p)
    _state.update(listing_date=date, last_full=time.time())
    return [p for pid, p in found.items() if pid not in known_ids and is_relevant(p["title"], p["abstract"])]


def poll_new(known_ids, max_pages=14):
    """New papers from the listing pages (primary), plus the API every 30 minutes (secondary,
    allowed to fail: arXiv throttles it under load)."""
    fresh = {p["id"]: (p, "listing") for p in poll_listings(known_ids)}
    if time.time() - _state["last_api"] > 1800:
        _state["last_api"] = time.time()
        try:
            for p, src in _poll_api(known_ids | set(fresh), max_pages):
                fresh.setdefault(p["id"], (p, src))
        except Exception:
            pass
    return list(fresh.values())


def _poll_api(known_ids, max_pages=14):
    """Newest-first API pages until we hit papers we already have, plus RSS."""
    fresh, start = {}, 0
    for _ in range(max_pages):
        batch = fetch_api(start=start, max_results=PAGE, retries=0)   # secondary source: don't stall
        start += len(batch)
        new = [p for p in batch if p["id"] not in known_ids]
        for p in new:
            if is_relevant(p["title"], p["abstract"]):
                fresh[p["id"]] = (p, "api")
        if not batch or len(new) < len(batch) * 0.5:
            break
    try:
        for p in fetch_rss():
            if p["id"] not in known_ids and p["id"] not in fresh and is_relevant(p["title"], p["abstract"]):
                fresh[p["id"]] = (p, "rss")
    except Exception:
        pass
    return list(fresh.values())
