"""HTTP server: web UI, JSON API for humans and agents, and a live event stream.

    python3 server.py            # backfills + grows the tree on first run, then polls arXiv
"""
import hmac
import json
import os
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import config
from engine import Engine

STATIC = config.ROOT / "static"
def log(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)


engine = Engine(log=log)
STARTED = time.time()


def admin_allowed(handler):
    """Admin endpoints: a matching X-Admin-Token when ADMIN_TOKEN is set; otherwise only direct
    local requests. Behind a reverse proxy every request arrives from 127.0.0.1, so a forwarded
    request is never treated as local."""
    token = os.environ.get("ADMIN_TOKEN")
    if token:
        return hmac.compare_digest(handler.headers.get("X-Admin-Token", ""), token)
    forwarded = handler.headers.get("X-Forwarded-For") or handler.headers.get("Forwarded")
    return not forwarded and handler.client_address[0] in ("127.0.0.1", "::1")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    # ---- helpers
    def _send(self, code, body, ctype="application/json"):
        if not isinstance(body, (bytes, str)):
            body = json.dumps(body)
        if isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith(("text", "application/json")) else ""))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _file(self, name, ctype):
        path = STATIC / name
        if not path.exists():
            return self._send(404, {"error": "not found"})
        self._send(200, path.read_bytes(), ctype)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ---- routes
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[-1] for k, v in urllib.parse.parse_qs(u.query).items()}
        parts = [p for p in u.path.split("/") if p]
        try:
            if u.path in ("/", "/index.html"):
                return self._file("index.html", "text/html")
            if u.path in ("/agents.md", "/llms.txt"):
                return self._send(200, (config.ROOT / "AGENTS.md").read_text(), "text/markdown")
            if u.path == "/api/tree":
                return self._send(200, engine.tree_json())
            if u.path == "/api/status":
                return self._send(200, engine.status_json())
            if u.path == "/api/health":
                # for uptime monitors: unhealthy if polling has stalled, not just if the process is down
                st = engine.status
                age = time.time() - st["last_poll"] if st["last_poll"] else None
                ok = (age is not None and age < 20 * 60) or (age is None and time.time() - STARTED < 10 * 60)
                return self._send(200 if ok else 503, {"ok": ok, "last_poll_age_s": age and round(age),
                                                       "papers": len(engine.papers), "last_error": st["last_error"]})
            if u.path == "/api/frontier":
                return self._send(200, engine.frontier(branch=q.get("branch"),
                                                       days=float(q.get("days", config.FRONTIER_DAYS)),
                                                       limit=int(q.get("limit", 15)),
                                                       per_leaf=int(q.get("per_leaf", 5))))
            if u.path == "/api/locate":
                if not q.get("q"):
                    return self._send(400, {"error": "missing q"})
                return self._send(200, engine.locate(q["q"][:4000], method=q.get("method", "auto")))
            if len(parts) == 3 and parts[:2] == ["api", "node"]:
                d = engine.node_json(parts[2], limit=int(q.get("limit", 60)))
                return self._send(200, d) if d else self._send(404, {"error": "unknown node"})
            if u.path == "/api/aspects":
                try:
                    return self._send(200, engine.aspects({k: q.get(k, "")[:500] for k in engine.ASPECTS}))
                except ValueError as ex:
                    return self._send(400, {"error": str(ex)})
            if u.path == "/api/reading":
                if not q.get("q"):
                    return self._send(400, {"error": "missing q"})
                return self._send(200, engine.reading_list(q["q"][:4000]))
            if len(parts) == 4 and parts[:2] == ["api", "lineage"]:
                fn = {"node": engine.lineage_node, "paper": engine.lineage_paper}.get(parts[2])
                d = fn(parts[3]) if fn else None
                return self._send(200, d) if d else self._send(404, {"error": "unknown id"})
            if len(parts) == 3 and parts[:2] == ["api", "paper"]:
                p = engine.papers.get(parts[2])
                if not p:
                    return self._send(404, {"error": "unknown paper"})
                return self._send(200, dict(engine._card(parts[2]), abstract=p["abstract"],
                                            categories=p["categories"], path=engine.path(p["node"])))
            if len(parts) == 3 and parts[:2] == ["api", "watch"]:
                v = engine.alerts.view(parts[2])
                return self._send(200, v) if v else self._send(404, {"error": "unknown alert"})
            if len(parts) == 2 and parts[0] == "feed" and parts[1].endswith(".xml"):
                host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or f"{config.HOST}:{config.PORT}"
                proto = self.headers.get("X-Forwarded-Proto", "http")
                xml = engine.alerts.feed(parts[1][:-4], f"{proto}://{host}/")
                return self._send(200, xml, "application/rss+xml") if xml else self._send(404, {"error": "unknown feed"})
            if u.path == "/api/events":
                return self._events()
            self._send(404, {"error": "not found"})
        except BrokenPipeError:
            pass
        except Exception as ex:
            self._send(500, {"error": str(ex)})

    def do_POST(self):
        parts = [p for p in urllib.parse.urlparse(self.path).path.split("/") if p]
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n) or b"{}")
            if parts == ["api", "poll"]:
                if not admin_allowed(self):
                    return self._send(403, {"error": "admin token required"})
                placed = engine.poll_once()
                return self._send(200, {"new": len(placed), "status": engine.status_json()})
            if parts == ["api", "watch"]:
                token = engine.alerts.create(body.get("kind", "idea"), query=body.get("query", ""),
                                             node=body.get("node", ""), webhook=body.get("webhook", ""),
                                             label=body.get("label", ""))
                return self._send(201, {"token": token, "feed": f"/feed/{token}.xml", "view": f"/api/watch/{token}"})
            if len(parts) == 4 and parts[:2] == ["api", "watch"] and parts[3] == "stop":
                engine.store.deactivate_watch(parts[2])
                return self._send(200, {"ok": True})
            if len(parts) == 4 and parts[:2] == ["api", "node"] and parts[3] == "signal":
                sid = engine.add_signal(parts[2], body.get("kind"), body.get("who"), body.get("actor", "human"),
                                        body.get("text"), body.get("visibility", "public"))
                return self._send(201, {"ok": True, "id": sid})
            self._send(404, {"error": "not found"})
        except KeyError:
            self._send(404, {"error": "unknown node"})
        except ValueError as ex:
            self._send(400, {"error": str(ex)})

    def _events(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        q = engine.subscribe()
        try:
            self.wfile.write(f"data: {json.dumps({'type': 'status', 'status': engine.status_json()})}\n\n".encode())
            self.wfile.flush()
            while True:
                try:
                    ev = q.get(timeout=20)
                    self.wfile.write(f"data: {json.dumps(ev)}\n\n".encode())
                except Exception:
                    self.wfile.write(b": keepalive\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            engine.unsubscribe(q)
            self.close_connection = True


def main():
    engine.ensure_built()
    delay = float(os.environ.get("RT_FIRST_POLL_DELAY", "0"))
    threading.Thread(target=engine.run_poller, args=(delay,), daemon=True).start()
    srv = ThreadingHTTPServer((config.HOST, config.PORT), Handler)
    srv.daemon_threads = True
    log(f"Research tree live at http://{config.HOST}:{config.PORT}  ({len(engine.papers)} papers)")
    srv.serve_forever()


if __name__ == "__main__":
    main()
