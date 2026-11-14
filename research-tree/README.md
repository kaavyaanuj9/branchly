# Research Tree: LLM Agents (demo)

A research map that grows like a tree as new papers come out. Humans and agents can walk to a
branch tip (the newest frontier of a direction), see who is already working there, check whether
their idea is new, and leave signals for the next person.

```
python3 server.py        # first run backfills ~60 days from arXiv (~2 min), then serves http://127.0.0.1:8765
```

Requires Python 3.10+ with `numpy` and `scikit-learn` (versions pinned in `requirements.txt`). No API keys and no database server are needed.

For meaning-based search, use the project virtual environment:

```
python3 -m venv --system-site-packages .venv && .venv/bin/pip install fastembed
.venv/bin/python embeddings.py     # one-time: embeds every paper (~1 h on a laptop CPU)
.venv/bin/python server.py
```

## Search ("locate my idea")

Your idea is embedded with a small local model (bge-small) and compared with every paper. The 15
nearest papers vote, weighted by similarity, for the topic your idea belongs to. The **novelty
verdict** counts how many of the 20 closest papers a cross-encoder reranker judges to directly address
the idea: 6 or more is crowded, 2–5 related, 0–1 sparse. An earlier rule based only on the single
closest similarity called short two-concept ideas "sparse" even in crowded areas. That similarity is
still shown, as a percentile against how close ~1,500 real papers were to their prior work.

`evals/locate_eval.py` scores search against real citations. Each of 400 recent papers becomes a short
idea (title and first sentence), and we check whether search finds the papers it actually cites:

| | keyword (LSA) | neural |
|---|---|---|
| ≥1 cited paper in top 20 | 45% | 57% |
| share of citations found | 8.1% | 12.2% |
| MRR of first cited paper | 0.14 | 0.25 |

## Deploy to a VPS

This targets a small Ubuntu 24.04 server (2 vCPU, 4 GB RAM), e.g. from Hetzner or DigitalOcean.
The site sits behind a password. HTTPS comes from Caddy, using your domain or a free `<ip>.sslip.io` address.

1. Create the server and add your SSH key. Optionally put `S2_API_KEY=...` in a local `.env` file;
   it is git-ignored and gets copied to the server.
2. From your Mac:
   ```
   deploy/push.sh root@SERVER_IP --first-time
   ```
   This copies the code and a consistent snapshot of the data (database, tree model, search vectors,
   embedding model). It then runs `deploy/setup.sh`, which:
   - installs Python 3.13 with the pinned libraries;
   - sets up a systemd service that restarts on failure;
   - sets up Caddy (HTTPS and basic auth) and a firewall;
   - adds a nightly database backup that keeps 7 copies.
   It asks once for the site username and password.
3. Later code updates: `deploy/push.sh root@SERVER_IP`. Only code is sent, and the server's data is kept.
4. Point a free uptime monitor (e.g. UptimeRobot) at `https://SITE/api/health`. It returns 503 if
   polling stalls.

After the server is live, stop the Mac service with `scripts/service.sh uninstall`, so two copies
don't both poll arXiv.

## Keep it running (macOS)

```
scripts/service.sh install     # background service: starts at login, restarts on crash
scripts/service.sh status      # running? last poll? next release?
scripts/service.sh logs        # follow data/server.log
scripts/service.sh uninstall   # stop and remove
```

While the service runs it prevents idle sleep (`caffeinate -i`). A closed lid on battery still sleeps the Mac.
This is a stopgap until the app is deployed to a server.

## How "up to date" works

An arXiv paper becomes public when arXiv announces it. Announcements happen Sun–Thu at 20:00 America/New_York.
The server polls the arXiv API (newest first) plus the combined RSS feed:

- every 60 s from 10 minutes before to 60 minutes after each announcement
- every 5 min otherwise

Each new paper is embedded and dropped onto the nearest leaf straight away. The page then updates over
Server-Sent Events, so it pulses the leaf, adds the paper to "Just in" and shows a toast. The header
shows the countdown to the next release and the measured catch latency (`first_seen - announced`).

## How the tree grows

| Level | How it's made |
|---|---|
| Root → 13 branches | Curated in `config.py` (keywords + landmark papers). Experts judge a map by its top level. |
| Branch → topics → sub-topics | Recursive k-means on a hybrid of meaning (bge-small) and keyword (TF-IDF/LSA) vectors, labelled with distinctive phrases |
| Leaf → tips | The newest papers on that leaf |

- **Incremental:** new papers descend to the closest leaf centroid, so nothing is re-clustered on each arrival.
- **Re-grow:** after 12% new papers, topics are re-clustered. Topics that continue keep their id, so
  claims and dead-end marks stay attached; signals on vanished topics move to their successor.
- **Bridges:** a paper that fits a second branch almost as well is tagged ↔. Each topic also lists its
  nearest topics in other branches, because research isn't strictly a tree.
- **Momentum:** a node's share of the last 14 days divided by the field's share (1.0× = keeping pace).
- **Opportunity:** recent volume × momentum, divided by claims, halved if marked a dead end.
- **Better labels (optional):** set `ANTHROPIC_API_KEY` and `pip install anthropic`, then run
  `python3 build.py --rebuild`. Claude renames the topics from their keywords and most typical papers.

**Which vectors to grow the tree in** was decided by `evals/tree_eval.py`. Topics should follow real
lines of work, so papers should cite their own topic more often than chance:

| tree built from | topics | citations inside own topic | vs. chance |
|---|---|---|---|
| keywords (TF-IDF/LSA) | 429 | 6.8% | 24.0× |
| meaning (neural) | 446 | 6.8% | 24.7× |
| **hybrid (used)** | 442 | 7.0% | 25.6× |

The gain is modest, but topic labels also read more coherently. Set `RT_TREE_SPACE=lsa` to go back.

## Lineage: references as a second view

The topic tree decides where papers sit. Inside any branch or topic, the **Lineage** view shows who
builds on whom. Time runs left to right, colour shows the branch, and dashed papers come from other
topics or branches. Click a paper to follow its full ancestry and descendants.

References come from two sources:

- **Day 0:** parsed from the paper's arXiv HTML bibliography. Entries resolve to arXiv ids or are
  matched by title against the tree.
- **A few days later:** Semantic Scholar's batch API, which replaces the HTML parse. It is refreshed
  every 6 hours, and missing ones are retried weekly.

"Built on by N" is a neutral indicator. Hollow means nothing in the tree builds on the paper yet.
That could mean the paper is new, overlooked, or a hidden gem. It never lowers a ranking.

History: `python3 build.py --history` loads every matching paper since Oct 2022 (resumable) and
fetches references. Run `python3 build.py --rebuild` afterwards. Foundational papers that predate
the "agent" vocabulary, such as Chain-of-Thought, are added from `EXTRA_LANDMARKS` in `config.py`.

## Reading list ("what should I read for my idea?")

After locating an idea, **What should I read?** builds a list from the citation lineage around it:

1. **Foundations:** papers the 50 nearest papers cite. They are scored by how many of those neighbours
   cite them (weighted by closeness) and by how specific that is to this neighbourhood compared with
   the whole tree. Papers everyone cites (ReAct, Chain-of-Thought) go to a separate "classics" line.
2. **Closest work:** the most similar papers, to position against.
3. **Newest frontier:** recent papers that build on the neighbourhood.

The graph numbers each paper as in the list and shows who builds on whom. The list can be copied as Markdown.

`evals/reading_eval.py` turns 300 recent papers into short ideas, builds lists from earlier papers only,
and checks against what the authors actually cited:

| | similarity search | reading list |
|---|---|---|
| ≥1 cited paper on a 20-paper list | 60% | 69% |
| share of citations covered | 11.2% | 17.9% |
| cited papers found per list | 1.23 | 2.08 |

Settings (50 neighbours, 11 foundations, 5 closest, 4 newest) were tuned on a separate sample.

## Combination check ("has problem + method + setting been done?")

After locating an idea, **Break it down** lets you name its problem, method and setting separately.
The check then reports whether any paper in the tree combines them, with a quoted sentence from each
paper as evidence:

1. **Shortlist.** Every abstract sentence has its own embedding, so one part of a paper isn't drowned
   out by the rest. Up to 40 candidates are ranked by their average closeness across the parts.
2. **Confirm.** A cross-encoder reranker (ms-marco MiniLM-L-12) reads each part next to the candidate's
   4 closest sentences. A paper counts only if *every* part is clearly addressed: a weakest-part score
   above −4 is a "possible match" and above 0 a "strong match".
3. **Verdict:** already combined / possibly combined / new combination / a part nothing in the tree
   matches (which may also mean it's outside the tree's coverage).

`evals/aspects_phrases_eval.py` describes 12 real papers in short user-style phrases. With the paper
in the tree, the check found all 12. With parts shuffled across papers, it found 0 false combinations.
That's a small hand-made sanity test, not a benchmark. A check takes about 5 seconds on a laptop CPU.

## Alerts

**Alert me** (after Locate, or on any topic) watches an idea or a topic. After every arXiv release,
new papers are checked:

- **Topic alert:** any new paper placed inside that topic.
- **Idea alert:** the closest new papers are re-read by the reranker, and only those that directly
  address the idea count. This is the same bar as "directly relevant" in locate.

Delivery needs no accounts:

- a private RSS feed (`/feed/<token>.xml`);
- optionally, a Slack or Discord channel webhook. Only those hosts are accepted, so the server can't
  be pointed at arbitrary addresses.
- the **My alerts** panel, kept in the browser.

Creating an alert also collects matches from the last 14 days. These are shown but not pushed. On
the deployed site, `/feed/*` is outside the password, because feed readers can't log in; the
unguessable token protects each feed.

## MCP server (for Claude and other agents)

`mcp_server.py` exposes the tree as 9 tools: `tree_overview`, `find_frontiers`, `read_topic`,
`locate_idea`, `check_combination`, `reading_list`, `paper_lineage` (all read-only), `watch`
(create an alert) and `post_signal`.
It is a thin client of the HTTP API, so it works against the local site or the deployed one. Register
it with Claude Code:

```
claude mcp add research-tree -- "$PWD/.venv/bin/python" "$PWD/mcp_server.py"
```

For the deployed site, add `-e RESEARCH_TREE_URL=https://SITE -e RESEARCH_TREE_USER=... -e RESEARCH_TREE_PASSWORD=...`.

## Files

- `config.py`: scope query, polling cadence, and the curated branches
- `ingest.py`: arXiv API/RSS clients and announcement-schedule maths
- `model.py`: embedding, branch assignment, topic growth, labelling, and incremental placement
- `engine.py`: live state, poller, stats, frontier ranking, locate/novelty, signals, and the lineage graph
- `refs.py`: references from arXiv HTML (day 0) and Semantic Scholar (back catalogue)
- `embeddings.py`: neural paper and sentence vectors for search, plus the reranker (cached in `data/`)
- `mcp_server.py`: MCP tools for Claude and other agents
- `alerts.py`: idea and topic alerts (matching, RSS feeds, Slack/Discord webhooks)
- `evals/locate_eval.py`: search quality measured against real citations
- `evals/reading_eval.py`: reading-list quality measured against real citations
- `evals/aspects_phrases_eval.py`: combination-check sanity test (12 papers in user-style phrases)
- `server.py`: stdlib HTTP server with the JSON API and SSE stream
- `static/index.html`: D3 tree UI
- `AGENTS.md`: API guide for agents (also served at `/agents.md`)
- `build.py`: run the backfill or re-grow without the server (`--rebuild`, `--print`)

## Known limits of the demo

- Only arXiv is covered. OpenReview, ACL Anthology and conference proceedings would be the next sources.
  Semantic Scholar needs an API key for citation edges.
- Topic labels come from keywords unless Claude is enabled, so a few mixed clusters get odd names.
- Signals have no accounts. Anyone on the network can post. Add auth before sharing it.
- arXiv holidays are not in the schedule maths. Polling still catches those papers, but the shown
  "public since" may be off by a day.
