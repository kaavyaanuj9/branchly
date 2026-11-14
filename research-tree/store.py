"""SQLite storage: papers, the human/agent signals attached to tree nodes, and meta."""
import json
import sqlite3
import threading
import time

from config import DATA, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,           -- arXiv id without version
    version INTEGER,
    title TEXT, abstract TEXT, authors TEXT, categories TEXT,
    published REAL,                -- v1 submission (unix)
    updated REAL,
    announced REAL,                -- when it became public on arXiv (unix)
    first_seen REAL,               -- when this system ingested it (unix)
    source TEXT,                   -- backfill | api | rss
    branch TEXT, node TEXT         -- assigned tree position
);
CREATE INDEX IF NOT EXISTS papers_announced ON papers(announced);
CREATE INDEX IF NOT EXISTS papers_node ON papers(node);
CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node TEXT, kind TEXT, who TEXT, actor TEXT, text TEXT, visibility TEXT, created REAL
);
CREATE INDEX IF NOT EXISTS signals_node ON signals(node);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
-- outgoing references that point at arXiv papers (in the tree or not yet)
CREATE TABLE IF NOT EXISTS refs (
    citing TEXT, cited TEXT, source TEXT,   -- source: s2 | html
    PRIMARY KEY (citing, cited)
);
CREATE INDEX IF NOT EXISTS refs_cited ON refs(cited);
-- alerts: watch an idea (text) or a topic (node); new matching papers become hits
CREATE TABLE IF NOT EXISTS watches (
    token TEXT PRIMARY KEY,          -- unguessable; the feed / API link is the only key
    kind TEXT, query TEXT, node TEXT, label TEXT, webhook TEXT, created REAL, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS watch_hits (
    token TEXT, paper TEXT, score REAL, reason TEXT, created REAL, sent INTEGER DEFAULT 0,
    PRIMARY KEY (token, paper)
);
CREATE INDEX IF NOT EXISTS watch_hits_created ON watch_hits(created);
"""
# columns added after the first version of the schema
MIGRATIONS = [
    "ALTER TABLE papers ADD COLUMN refs_source TEXT",     # s2 | html | none
    "ALTER TABLE papers ADD COLUMN refs_fetched REAL",
    "ALTER TABLE papers ADD COLUMN refs_total INTEGER",   # all references, arXiv or not
]


class Store:
    def __init__(self, path=DB_PATH):
        DATA.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False, timeout=60)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        for m in MIGRATIONS:
            try:
                self.conn.execute(m)
            except sqlite3.OperationalError:
                pass  # already applied
        self.lock = threading.Lock()

    # ---- papers ----
    def known_ids(self):
        return {r[0] for r in self.conn.execute("SELECT id FROM papers")}

    def add_papers(self, papers, source):
        now = time.time()
        rows = [(p["id"], p["version"], p["title"], p["abstract"], json.dumps(p["authors"]),
                 json.dumps(p["categories"]), p["published"], p["updated"], p["announced"],
                 now, source) for p in papers]
        with self.lock, self.conn:
            cur = self.conn.executemany(
                "INSERT OR IGNORE INTO papers(id,version,title,abstract,authors,categories,published,"
                "updated,announced,first_seen,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)", rows)
        return cur.rowcount

    def set_positions(self, assignments):
        """assignments: iterable of (paper_id, branch, node)."""
        with self.lock, self.conn:
            self.conn.executemany("UPDATE papers SET branch=?, node=? WHERE id=?",
                                  [(b, n, pid) for pid, b, n in assignments])

    def all_papers(self):
        return [dict(r) for r in self.conn.execute("SELECT * FROM papers ORDER BY announced")]

    def papers_by_ids(self, ids):
        if not ids:
            return []
        q = ",".join("?" * len(ids))
        return [dict(r) for r in self.conn.execute(f"SELECT * FROM papers WHERE id IN ({q})", list(ids))]

    def count(self):
        return self.conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]

    # ---- references ----
    def set_refs(self, citing, cited_ids, source, total):
        """Replace a paper's references. Semantic Scholar refs are never overwritten by HTML refs."""
        with self.lock, self.conn:
            cur = self.conn.execute("SELECT refs_source FROM papers WHERE id=?", (citing,)).fetchone()
            if cur and cur[0] == "s2" and source == "html":
                return False
            self.conn.execute("DELETE FROM refs WHERE citing=?", (citing,))
            self.conn.executemany("INSERT OR IGNORE INTO refs(citing,cited,source) VALUES (?,?,?)",
                                  [(citing, c, source) for c in cited_ids if c != citing])
            self.conn.execute("UPDATE papers SET refs_source=?, refs_fetched=?, refs_total=? WHERE id=?",
                              (source, time.time(), total, citing))
        return True

    def mark_refs_missing(self, ids):
        with self.lock, self.conn:
            self.conn.executemany("UPDATE papers SET refs_source='none', refs_fetched=? WHERE id=?",
                                  [(time.time(), i) for i in ids])

    def all_refs(self):
        return self.conn.execute("SELECT citing, cited FROM refs").fetchall()

    def ids_needing_refs(self, older_than_days=3):
        """Never fetched, or only HTML/none so far and old enough for Semantic Scholar to have them."""
        cutoff = time.time() - older_than_days * 86400
        stale = time.time() - 7 * 86400
        fresh = time.time() - 2 * 86400   # too new for Semantic Scholar; day-0 HTML parsing covers these
        return [r[0] for r in self.conn.execute(
            "SELECT id FROM papers WHERE (refs_source IS NULL AND announced < ?) "
            "OR (refs_source IN ('html','none') AND announced < ? AND refs_fetched < ?) "
            "ORDER BY announced DESC", (fresh, cutoff, stale))]

    # ---- alerts ----
    def add_watch(self, token, kind, query, node, label, webhook):
        with self.lock, self.conn:
            self.conn.execute("INSERT INTO watches(token,kind,query,node,label,webhook,created) VALUES (?,?,?,?,?,?,?)",
                              (token, kind, query, node, label, webhook, time.time()))

    def watches(self, active=True):
        q = "SELECT * FROM watches" + (" WHERE active=1" if active else "")
        return [dict(r) for r in self.conn.execute(q)]

    def watch(self, token):
        r = self.conn.execute("SELECT * FROM watches WHERE token=?", (token,)).fetchone()
        return dict(r) if r else None

    def deactivate_watch(self, token):
        with self.lock, self.conn:
            self.conn.execute("UPDATE watches SET active=0 WHERE token=?", (token,))

    def add_hits(self, token, hits):
        """hits: [(paper_id, score, reason)]; returns the ones that are new for this watch."""
        new, now = [], time.time()   # one timestamp per batch, so a batch sorts by score
        with self.lock, self.conn:
            for pid, score, reason in hits:
                cur = self.conn.execute("INSERT OR IGNORE INTO watch_hits(token,paper,score,reason,created) "
                                        "VALUES (?,?,?,?,?)", (token, pid, score, reason, now))
                if cur.rowcount:
                    new.append((pid, score, reason))
        return new

    def hits(self, token, limit=100):
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM watch_hits WHERE token=? ORDER BY created DESC, score DESC LIMIT ?", (token, limit))]

    def mark_sent(self, token, pids):
        with self.lock, self.conn:
            self.conn.executemany("UPDATE watch_hits SET sent=1 WHERE token=? AND paper=?", [(token, p) for p in pids])

    # ---- signals ----
    def add_signal(self, node, kind, who, actor, text, visibility):
        with self.lock, self.conn:
            cur = self.conn.execute(
                "INSERT INTO signals(node,kind,who,actor,text,visibility,created) VALUES (?,?,?,?,?,?,?)",
                (node, kind, who, actor, text, visibility, time.time()))
        return cur.lastrowid

    def signals(self, node=None):
        if node:
            rows = self.conn.execute("SELECT * FROM signals WHERE node=? ORDER BY created DESC", (node,))
        else:
            rows = self.conn.execute("SELECT * FROM signals ORDER BY created DESC")
        return [dict(r) for r in rows]

    def remap_signals(self, mapping):
        with self.lock, self.conn:
            self.conn.executemany("UPDATE signals SET node=? WHERE node=?",
                                  [(new, old) for old, new in mapping.items() if old != new])

    # ---- meta ----
    def get_meta(self, k, default=None):
        r = self.conn.execute("SELECT v FROM meta WHERE k=?", (k,)).fetchone()
        return json.loads(r[0]) if r else default

    def set_meta(self, k, v):
        with self.lock, self.conn:
            self.conn.execute("INSERT OR REPLACE INTO meta(k,v) VALUES (?,?)", (k, json.dumps(v)))
