"""Settings for one Research Tree instance; the field it covers comes from fields/ (RT_FIELD).

Generic settings (polling cadence, frontier window, data locations) live here; what the
tree covers (sources, scope, curated branches, landmarks) lives in the field profile.
"""
import os
from pathlib import Path

ROOT = Path(__file__).parent


def _load_env_file(path):
    """KEY=value lines from a local, git-ignored .env file (e.g. S2_API_KEY). Real env vars win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file(ROOT / ".env")
from fields import FIELD  # noqa: E402  (after .env so RT_FIELD can come from it)

ASPECT_EXAMPLES = getattr(FIELD, "ASPECT_EXAMPLES", {})
FIELD_NAME = FIELD.NAME
SOURCE = FIELD.SOURCE
COVERAGE = FIELD.COVERAGE
BRANCHES = FIELD.BRANCHES
SURVEY_ROOTS = FIELD.SURVEY_ROOTS
EXTRA_LANDMARKS = FIELD.EXTRA_LANDMARKS

# each field keeps its own data; the original single-field layout (data/) is still used
# for llm_agents when it exists, so an existing install keeps working
_legacy = ROOT / "data" / "tree.db"
DATA = ROOT / "data" if FIELD.SLUG == "llm_agents" and _legacy.exists() else ROOT / "data" / FIELD.SLUG
if os.environ.get("RT_DATA"):          # explicit data folder (deployments, tests)
    DATA = Path(os.environ["RT_DATA"])
DB_PATH = DATA / "tree.db"
MODEL_PATH = DATA / "model.pkl"

HOST = os.environ.get("RT_HOST", "127.0.0.1")
PORT = int(os.environ.get("RT_PORT", str(FIELD.DEFAULT_PORT)))

# source-specific scope, when the field defines it (arXiv)
CATEGORIES = getattr(FIELD, "CATEGORIES", [])
ARXIV_QUERY = getattr(FIELD, "ARXIV_QUERY", "")
RSS_URL = getattr(FIELD, "RSS_URL", "")
LLM_PATTERN = getattr(FIELD, "LLM_PATTERN", "")
AGENT_PATTERN = getattr(FIELD, "AGENT_PATTERN", "")

BACKFILL_DAYS = int(os.environ.get("RT_BACKFILL_DAYS", "60"))
BACKFILL_MAX = int(os.environ.get("RT_BACKFILL_MAX", "9000"))

# Polling cadence. arXiv announces Sun-Thu 20:00 America/New_York; we poll hard
# in the window around that, and gently otherwise.
POLL_SECONDS = 300
HOT_POLL_SECONDS = 60
HOT_WINDOW_MIN = (-10, 60)          # minutes relative to 20:00 ET
FRONTIER_DAYS = 14                  # "frontier" = public within this many days
REBUILD_FRACTION = 0.12             # full re-cluster after this share of new papers

# Optional: name clusters with Claude when a key is available.
LLM_LABEL_MODEL = os.environ.get("RT_LABEL_MODEL", "claude-opus-5-5")
