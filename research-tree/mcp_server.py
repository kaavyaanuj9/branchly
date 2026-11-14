"""MCP server: lets Claude (Code / Desktop) and other agents use the research tree as tools.

A thin client of the HTTP API, so it works against the local site or the deployed one.

    RESEARCH_TREE_URL       default http://127.0.0.1:8765
    RESEARCH_TREE_USER      basic-auth user for the deployed (password-protected) site
    RESEARCH_TREE_PASSWORD  basic-auth password

Register with Claude Code:
    claude mcp add research-tree -- "/path/to/research tree/.venv/bin/python" "/path/to/research tree/mcp_server.py"
"""
import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations

BASE = os.environ.get("RESEARCH_TREE_URL", "http://127.0.0.1:8765").rstrip("/")
READ = ToolAnnotations(read_only_hint=True, open_world_hint=False)

server = MCPServer(
    "research-tree",
    instructions=(
        "A live map of one research field (tree_overview says which, e.g. LLM agents from arXiv or "
        "cancer & cell biology from bioRxiv), with new papers added as they appear. "
        "Typical flow: find_frontiers or tree_overview to pick "
        "a direction; locate_idea to see where an idea sits and how crowded it is; check_combination "
        "to see whether problem + method + setting has been done; reading_list for what to read; "
        "paper_lineage to follow who builds on whom; post_signal to tell others what you are working "
        "on or what failed. A paper being 'not built on yet' is neutral, not a quality judgement."
    ),
)


def _call(path, params=None, body=None, timeout=120):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    headers = {"Content-Type": "application/json"}
    user, pw = os.environ.get("RESEARCH_TREE_USER"), os.environ.get("RESEARCH_TREE_PASSWORD")
    if user and pw:
        headers["Authorization"] = "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as ex:
        try:
            msg = json.loads(ex.read()).get("error", ex.reason)
        except Exception:
            msg = ex.reason
        raise RuntimeError(f"research tree API {ex.code}: {msg}") from None
    except urllib.error.URLError as ex:
        raise RuntimeError(f"research tree not reachable at {BASE}: {ex.reason}") from None


def _date(ts):
    return time.strftime("%Y-%m-%d", time.gmtime(ts)) if ts else None


def _paper(p, abstract=0):
    out = {"paper_id": p["id"], "title": p["title"], "public": _date(p.get("announced")),
           "url": p.get("url") or f"https://arxiv.org/abs/{p['id']}"}
    if "built_on" in p:
        out["built_on_by_papers_in_tree"] = p["built_on"]
    if abstract and p.get("abstract"):
        out["abstract"] = p["abstract"][:abstract]
    return out


def _out(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1)


@server.tool(annotations=READ)
def tree_overview() -> str:
    """The top-level branches of this field with paper counts, papers added this week,
    momentum (recent share vs the field; >1.5 means heating up), and each branch's fastest-growing
    topics with their node ids. Start here to orient."""
    tree = _call("/api/tree")
    out = []
    for b in tree["children"]:
        leaves = []

        def walk(n):
            if "children" in n:
                for c in n["children"]:
                    walk(c)
            else:
                leaves.append(n)
        walk(b)
        hot = sorted(leaves, key=lambda n: -n["momentum"])[:3]
        out.append({"branch": b["label"], "node_id": b["id"], "papers": b["count"], "new_this_week": b["n7"],
                    "momentum": b["momentum"],
                    "fastest_growing_topics": [{"topic": n["label"], "node_id": n["id"], "momentum": n["momentum"],
                                                "new_this_week": n["n7"]} for n in hot]})
    return _out({"field": tree["label"], "papers_total": tree["count"], "branches": out})


@server.tool(annotations=READ)
def find_frontiers(branch: str = "", limit: int = 8) -> str:
    """Open research frontiers: leaf topics ranked by recent activity x acceleration, discounted when
    someone has claimed them or marked them a dead end. Each comes with its newest papers.
    branch: optional branch id (planning, tools, memory, multiagent, training, coding, gui, embodied,
    science, eval, safety, apps, systems)."""
    params = {"limit": max(1, min(limit, 20)), "per_leaf": 3}
    if branch:
        params["branch"] = branch
    res = _call("/api/frontier", params)
    return _out([{"node_id": f["node"], "path": " > ".join(f["path"]), "keywords": f["keywords"],
                  "new_last_14_days": f["new_last_14d"], "momentum": f["momentum"], "signals": f["signals"],
                  "newest_papers": [_paper(p, 300) for p in f["frontier_papers"]]} for f in res])


@server.tool(annotations=READ)
def read_topic(node_id: str) -> str:
    """Details of one branch or topic: path, keywords, stats, who has claimed it or marked it
    promising / a dead end (with their notes), newest papers, nearest topics in other branches
    (often where new ideas are), and landmark papers."""
    d = _call(f"/api/node/{urllib.parse.quote(node_id, safe='')}", {"limit": 12})
    return _out({"topic": d["label"], "path": " > ".join(p["label"] for p in d["path"]), "keywords": d["keywords"],
                 "papers": d["count"], "new_this_week": d["n7"], "momentum": d["momentum"],
                 "signals": d["signals"], "notes_from_others": d["signal_log"][:10],
                 "sub_topics": d["children"], "newest_papers": [_paper(p, 250) for p in d["papers"]],
                 "nearest_topics_in_other_branches": d["near"], "landmarks": d["roots"]})


@server.tool(annotations=READ)
def locate_idea(idea: str) -> str:
    """Where an idea sits on the tree and how crowded it is. Returns the topic path, a novelty level
    (crowded / related / sparse) from how many of the 20 closest papers a reranker judges to
    directly address the idea (6+ crowded, 2-5 related, 0-1 sparse), placement confidence (below
    0.35 = no clear home on the tree), and the closest papers."""
    r = _call("/api/locate", {"q": idea[:4000]})
    return _out({"path": " > ".join(p["label"] for p in r["path"][1:]), "node_id": r["node"],
                 "novelty": r["novelty_level"], "directly_relevant_of_20_closest": r.get("directly_relevant"),
                 "closeness_percentile": r["closeness_percentile"],
                 "placement_confidence": r["placement_confidence"], "hint": r["novelty_hint"],
                 "also_near_branch": r["bridge"]["label"] if r.get("bridge") else None,
                 "closest_papers": [dict(_paper(p, 200), similarity=p["sim"]) for p in r["nearest"][:6]]})


@server.tool(annotations=READ)
def check_combination(problem: str, method: str, setting: str = "") -> str:
    """Has this problem + method (+ setting) already been done? Checks each part separately, then
    finds papers covering all of them, quoting the abstract sentence that matched each part.
    Verdict kinds: combined, possible, new_combination, unstudied_part. Takes ~5-10 s."""
    params = {"problem": problem, "method": method}
    if setting:
        params["setting"] = setting
    r = _call("/api/aspects", params, timeout=180)
    full = r["combos"][-1]
    papers = full["papers"] or full["closest"]
    return _out({"verdict": r["verdict"]["kind"], "explanation": r["verdict"]["text"],
                 "overlaps": {" + ".join(c["parts"]): {"papers": c["count"], "clear": c["strong"]} for c in r["combos"]},
                 "papers_combining_all" if full["papers"] else "closest_but_below_bar": [
                     dict(_paper(p), match=p["strength"], evidence=p["evidence"]) for p in papers[:4]]})


@server.tool(annotations=READ)
def reading_list(idea: str) -> str:
    """What to read for an idea, from the citation lineage around it: foundations (what the 50
    nearest papers build on, oldest first), closest work, and newest frontier, each with a reason.
    Field-wide classics are listed separately."""
    r = _call("/api/reading", {"q": idea[:4000]})
    return _out({k: [dict(_paper(p), reason=p["reason"]) for p in r["sections"][k]] for k in r["order"]}
                | {"classics_you_probably_know": [p["title"] for p in r["classics"]]})


@server.tool(annotations=READ)
def paper_lineage(paper_id: str) -> str:
    """A paper's lineage inside the tree: what it builds on (most related first) and what has built
    on it (newest first), plus its abstract and position on the tree."""
    d = _call(f"/api/lineage/paper/{urllib.parse.quote(paper_id, safe='')}")
    return _out({"paper": _paper(d["paper"], 1200), "path": " > ".join(p["label"] for p in d["path"][1:]),
                 "builds_on": [_paper(p) for p in d["builds_on"]],
                 "built_on_by": [_paper(p) for p in d["built_on_by"]],
                 "references_source": d.get("refs_source")})


@server.tool(annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False))
def watch(idea: str = "", node_id: str = "", webhook: str = "") -> str:
    """Create an alert: new papers that directly address an idea (give `idea`) or that land in a
    topic (give `node_id`). Returns a private RSS feed link and the matches from the last 14 days.
    webhook: optional Slack or Discord channel webhook URL to post new matches to."""
    if bool(idea) == bool(node_id):
        raise ValueError("give either idea or node_id")
    body = {"kind": "idea", "query": idea} if idea else {"kind": "topic", "node": node_id}
    if webhook:
        body["webhook"] = webhook
    r = _call("/api/watch", body=body, timeout=180)
    v = _call(r["view"])
    return _out({"feed": BASE + r["feed"], "check_later": BASE + r["view"],
                 "recent_matches": [dict(_paper(h), reason=h["reason"]) for h in v["hits"][:10]]})


@server.tool(annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False))
def post_signal(node_id: str, kind: str, text: str = "", who: str = "agent", private: bool = False) -> str:
    """Leave a visible signal on a topic for other humans and agents.
    kind: claim (working on it), promising, dead_end (say what failed in text: this saves others
    days), note, or done. private=True counts a claim without showing who."""
    r = _call(f"/api/node/{urllib.parse.quote(node_id)}/signal", body={
        "kind": kind, "text": text, "who": who, "actor": "agent", "visibility": "private" if private else "public"})
    return _out({"ok": r.get("ok", False), "signal_id": r.get("id")})


if __name__ == "__main__":
    server.run("stdio")
