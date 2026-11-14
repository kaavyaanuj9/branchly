"""Alerts: watch an idea or a topic, get told when new papers land near it.

Delivery needs no accounts: a private RSS feed (any feed reader), an optional Slack or Discord
channel webhook, and the "My alerts" panel on the site. A watch's token is an unguessable
capability: whoever has the link can read that watch's matches.

Matching:
  topic watch: a new paper placed anywhere inside the watched topic (or its sub-topics).
  idea watch:  the new papers closest in meaning are re-read by the cross-encoder; a paper
               counts when it judges the paper to directly address the idea (score > 0, the
               same bar as "directly relevant" in locate).
"""
import json
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.utils import formatdate
from xml.sax.saxutils import escape

import numpy as np

from fields import FIELD

DAY = 86400.0
WEBHOOK_HOSTS = {"hooks.slack.com": "slack", "discord.com": "discord", "discordapp.com": "discord"}
RELEVANT = 0.0           # reranker score above which a paper "directly addresses" the idea
SHORTLIST = 15           # closest new papers re-read per idea watch


def webhook_kind(url):
    """'slack' / 'discord' for an allowed https webhook URL, else None. Only these hosts are
    allowed so the server can't be pointed at arbitrary (e.g. internal) addresses."""
    try:
        u = urllib.parse.urlparse(url)
    except ValueError:
        return None
    kind = WEBHOOK_HOSTS.get(u.hostname or "")
    if u.scheme != "https" or not kind:
        return None
    if kind == "discord" and not u.path.startswith("/api/webhooks/"):
        return None
    return kind


class Alerts:
    def __init__(self, engine):
        self.e = engine
        self.lock = threading.Lock()

    # ---------------------------------------------------------------- create / read
    def create(self, kind, query="", node="", webhook="", label="", backfill_days=14):
        e = self.e
        if kind not in ("idea", "topic"):
            raise ValueError("kind must be idea or topic")
        if kind == "idea" and len(query.split()) < 2:
            raise ValueError("describe the idea in a few words")
        if kind == "topic" and node not in e.model.nodes:
            raise ValueError("unknown topic")
        if webhook and not webhook_kind(webhook):
            raise ValueError("webhook must be a Slack (hooks.slack.com) or Discord (discord.com/api/webhooks) URL")
        label = (label or (query if kind == "idea" else e.model.nodes[node]["label"]))[:120]
        token = secrets.token_urlsafe(18)
        e.store.add_watch(token, kind, query[:2000], node, label, webhook)
        # show what it would have caught recently; these are not pushed to the webhook
        cutoff = time.time() - backfill_days * DAY
        recent = [p for p, d in e.papers.items() if d["announced"] > cutoff]
        hits = self.match(e.store.watch(token), recent, limit=25)
        new = e.store.add_hits(token, hits)
        e.store.mark_sent(token, [p for p, _, _ in new])
        return token

    def view(self, token, limit=50):
        w = self.e.store.watch(token)
        if not w:
            return None
        hits = []
        for h in self.e.store.hits(token, limit):
            if h["paper"] in self.e.papers:
                hits.append(dict(self.e._card(h["paper"], abstract_chars=300), reason=h["reason"],
                                 score=round(h["score"], 2), matched=h["created"]))
        return {"token": token, "kind": w["kind"], "label": w["label"], "query": w["query"], "node": w["node"],
                "active": bool(w["active"]), "webhook": webhook_kind(w["webhook"]) if w["webhook"] else None,
                "created": w["created"], "hits": hits}

    # ---------------------------------------------------------------- matching
    def match(self, w, candidates, limit=None):
        """[(paper_id, score, reason)] among candidate paper ids."""
        e = self.e
        if not candidates:
            return []
        if w["kind"] == "topic":
            inside = set(e._members(w["node"])) if w["node"] in e.model.nodes else set()
            return [(p, 1.0, f"new in {w['label']}") for p in candidates if p in inside][:limit]
        if e.E is None or e.embedder is None or e.reranker is None:
            return []                     # search models still loading; the next release will be checked
        q = e.embedder.embed([w["query"]])[0]
        rows = [(p, e.E_row[p]) for p in candidates if p in e.E_row]
        if not rows:
            return []
        sims = e.E[[r for _, r in rows]] @ q
        order = np.argsort(-sims)[:max(SHORTLIST, limit or 0)]
        short = [rows[i][0] for i in order]
        docs = [e.papers[p]["title"] + ". " + e.papers[p]["abstract"][:300] for p in short]
        scores = e.reranker.score(w["query"], docs)
        hits = [(p, float(s), f"directly addresses your idea (relevance {s:.1f})")
                for p, s in sorted(zip(short, scores), key=lambda x: -x[1]) if s > RELEVANT]
        return hits[:limit] if limit else hits

    def on_new_papers(self, ids):
        """Called after a poll places new papers: record hits, push webhooks, notify the page."""
        with self.lock:
            total = 0
            for w in self.e.store.watches():
                try:
                    new = self.e.store.add_hits(w["token"], self.match(w, ids))
                except Exception as ex:
                    self.e.log(f"  alert {w['token'][:6]}…: matching failed: {ex}")
                    continue
                if not new:
                    continue
                total += len(new)
                if w["webhook"] and self.push(w, new):
                    self.e.store.mark_sent(w["token"], [p for p, _, _ in new])
            if total:
                self.e.log(f"  alerts: {total} new matches")
                self.e.broadcast({"type": "alerts"})

    # ---------------------------------------------------------------- delivery
    def push(self, w, hits):
        kind = webhook_kind(w["webhook"])
        if not kind:
            return False
        lines = []
        for pid, _, reason in hits[:10]:
            title = self.e.papers[pid]["title"]
            url = FIELD.paper_url(pid)
            lines.append(f"• <{url}|{title}>" if kind == "slack" else f"• [{title}](<{url}>)")
        more = f"\n…and {len(hits) - 10} more" if len(hits) > 10 else ""
        head = f"*{len(hits)} new paper{'s' if len(hits) > 1 else ''}* for your alert “{w['label']}”"
        text = head + "\n" + "\n".join(lines) + more
        body = {"text": text} if kind == "slack" else {"content": text.replace("*", "**")[:1990]}
        for attempt in range(3):
            try:
                req = urllib.request.Request(w["webhook"], data=json.dumps(body).encode(),
                                             headers={"Content-Type": "application/json"})
                urllib.request.urlopen(req, timeout=20).read()
                return True
            except urllib.error.HTTPError as ex:
                if ex.code < 500 and ex.code != 429:
                    self.e.log(f"  alert webhook refused ({ex.code}) for {w['token'][:6]}…")
                    return False
            except Exception:
                pass
            time.sleep(5 * (attempt + 1))
        return False

    def feed(self, token, base_url):
        """RSS 2.0 for a watch: one item per matched paper."""
        v = self.view(token, limit=100)
        if not v:
            return None
        items = []
        for h in v["hits"]:
            desc = f"{h['reason']}. {h.get('abstract', '')}"
            items.append(
                "<item>"
                f"<title>{escape(h['title'])}</title>"
                f"<link>{escape(h['url'])}</link>"
                f"<guid isPermaLink=\"false\">{escape(token[:8] + ':' + h['id'])}</guid>"
                f"<pubDate>{formatdate(h['matched'], usegmt=True)}</pubDate>"
                f"<description>{escape(desc)}</description>"
                "</item>")
        title = f"Research Tree alert: {v['label']}"
        return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>'
                f"<title>{escape(title)}</title><link>{escape(base_url)}</link>"
                f"<description>New LLM-agent papers matching “{escape(v['label'])}”</description>"
                + "".join(items) + "</channel></rss>")
