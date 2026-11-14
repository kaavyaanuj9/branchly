"""Scope, sources and the hand-curated top level of the LLM-agents tree.

The top-level branches are curated on purpose: experts judge a map in the first
five minutes, and machine-named top branches are where clustering looks worst.
Everything below this level (topics, sub-topics, frontier tips) is grown
automatically from the papers.
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
DATA = ROOT / "data"
DB_PATH = DATA / "tree.db"
MODEL_PATH = DATA / "model.pkl"

HOST = os.environ.get("RT_HOST", "127.0.0.1")
PORT = int(os.environ.get("RT_PORT", "8765"))

# ---- arXiv scope -----------------------------------------------------------
CATEGORIES = ["cs.AI", "cs.CL", "cs.LG", "cs.MA", "cs.SE", "cs.HC", "cs.CR", "cs.IR", "cs.RO"]
_CAT = " OR ".join(f"cat:{c}" for c in CATEGORIES)
_TERMS = (
    'ti:agent OR ti:agents OR ti:agentic OR abs:"LLM agent" OR abs:"LLM agents" '
    'OR abs:"language agent" OR abs:"language agents" OR abs:agentic'
)
ARXIV_QUERY = f"({_CAT}) AND ({_TERMS})"
RSS_URL = "https://rss.arxiv.org/rss/" + "+".join(CATEGORIES)

# A paper must also look LLM-related (filters out classic MARL / robotics-only work).
LLM_PATTERN = (
    r"\b(llms?|large language models?|language models?|language agents?|gpt-?\d|claude|gemini|"
    r"qwen|llama|deepseek|foundation models?|vlms?|vision[- ]language|agentic|chatgpt|prompt\w*)\b"
)
AGENT_PATTERN = r"\b(agent\w*|multi-agent|tool[- ]use|tool[- ]calling|function[- ]calling|computer[- ]use)\b"

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

# ---- Curated top-level branches -------------------------------------------
# keywords: regexes used to seed each branch (weak supervision)
# roots:    landmark arXiv ids shown as the branch's lineage
BRANCHES = [
    {
        "id": "planning",
        "label": "Planning & Reasoning",
        "desc": "task decomposition, search over plans, reflection, self-correction, test-time compute for agents",
        "keywords": [r"\bplann\w*", r"task decomposition", r"tree search", r"\bmcts\b", r"self-reflect\w*",
                     r"\breflection\b", r"self-correct\w*", r"test-time (compute|scaling)", r"world model",
                     r"\breasoning\b"],
        "roots": ["2210.03629", "2305.10601", "2303.11366"],
    },
    {
        "id": "tools",
        "label": "Tool Use & Function Calling",
        "desc": "tool learning, API calling, function calling, MCP servers, tool retrieval and creation",
        "keywords": [r"tool[- ]use", r"tool[- ]calling", r"function[- ]calling", r"tool learning",
                     r"\bmcp\b", r"model context protocol", r"\bapis?\b", r"tool retrieval", r"tool creation",
                     r"\btools\b"],
        "roots": ["2302.04761", "2305.15334", "2307.16789"],
    },
    {
        "id": "memory",
        "label": "Memory & Context",
        "desc": "long-term memory, context engineering, context compression, agentic retrieval, knowledge bases",
        "keywords": [r"\bmemor\w+", r"context engineering", r"context (management|compression|window)",
                     r"long[- ]context", r"long[- ]term", r"\bretriev\w+", r"\brag\b", r"knowledge graph"],
        "roots": ["2310.08560", "2304.03442"],
    },
    {
        "id": "multiagent",
        "label": "Multi-Agent Systems",
        "desc": "agent collaboration, debate, communication protocols, orchestration, role-playing societies",
        "keywords": [r"multi-agent", r"multiagent", r"\bdebate\b", r"collaborat\w+", r"orchestrat\w+",
                     r"agent communication", r"\broles?\b", r"agent society", r"a2a"],
        "roots": ["2308.08155", "2303.17760", "2308.00352", "2305.14325"],
    },
    {
        "id": "training",
        "label": "Agent Training & RL",
        "desc": "agentic reinforcement learning, reward modeling, trajectory synthesis, self-improvement, fine-tuning agents",
        "keywords": [r"reinforcement learning", r"\brl\b", r"\bgrpo\b", r"\bppo\b", r"reward", r"fine-tun\w+",
                     r"self-improv\w+", r"self-evolv\w+", r"trajector\w+", r"policy optimization", r"\bsft\b",
                     r"credit assignment"],
        "roots": ["2501.12948"],
    },
    {
        "id": "coding",
        "label": "Coding & Software Agents",
        "desc": "software engineering agents, repository-level code, issue resolution, debugging, program repair",
        "keywords": [r"\bcod(e|ing)\b", r"software engineering", r"\bswe\b", r"swe-bench", r"repositor\w+",
                     r"program repair", r"\bdebug\w*", r"pull request", r"github", r"compiler", r"\bunit tests?\b"],
        "roots": ["2405.15793", "2310.06770"],
    },
    {
        "id": "gui",
        "label": "Web, GUI & Computer Use",
        "desc": "web navigation, browser agents, GUI grounding, mobile and desktop computer-use agents",
        "keywords": [r"\bweb\b", r"browser", r"\bgui\b", r"computer[- ]use", r"\bmobile\b", r"android",
                     r"desktop", r"screenshot", r"grounding", r"\bui\b", r"webpage", r"click"],
        "roots": ["2307.13854", "2306.06070", "2404.07972", "2401.13649"],
    },
    {
        "id": "embodied",
        "label": "Embodied, Games & Robotics",
        "desc": "embodied agents, robot manipulation and navigation with LLMs, game-playing and open-ended environments",
        "keywords": [r"embodied", r"\brobot\w*", r"manipulation", r"navigation", r"minecraft", r"\bgames?\b",
                     r"autonomous driving", r"vision-language-action", r"\bvla\b", r"simulat\w+ environment"],
        "roots": ["2305.16291"],
    },
    {
        "id": "science",
        "label": "Science & Deep Research",
        "desc": "deep research agents, AI scientists, hypothesis generation, chemistry biology materials discovery",
        "keywords": [r"scientific", r"\bscience\b", r"deep research", r"hypothes\w+", r"discovery",
                     r"chemistr\w+", r"biolog\w+", r"materials", r"literature", r"research agent", r"experiment"],
        "roots": ["2408.06292", "2304.05376"],
    },
    {
        "id": "eval",
        "label": "Evaluation & Benchmarks",
        "desc": "agent benchmarks, evaluation methodology, environments, LLM-as-judge for agents, failure analysis",
        "keywords": [r"benchmark\w*", r"\bevaluat\w+", r"leaderboard", r"testbed", r"\bjudge\b",
                     r"failure (modes|analysis)", r"environment suite"],
        "roots": ["2308.03688"],
    },
    {
        "id": "safety",
        "label": "Safety, Security & Alignment",
        "desc": "prompt injection, jailbreaks, red-teaming, guardrails, misalignment, privacy and trust in agents",
        "keywords": [r"prompt injection", r"jailbreak\w*", r"red[- ]team\w*", r"\bsafety\b", r"\bsecur\w+",
                     r"\battack\w*", r"guardrail\w*", r"\balign\w+", r"privacy", r"adversarial", r"backdoor",
                     r"misuse", r"deceptive", r"\btrust\w*", r"governance", r"accountab\w+", r"regulat\w+"],
        "roots": ["2403.02691", "2406.13352"],
    },
    {
        "id": "apps",
        "label": "Domain Applications",
        "desc": "agents for medicine, finance, law, education, data analysis, recommendation, social simulation",
        "keywords": [r"medic\w+", r"clinic\w+", r"health\w*", r"financ\w+", r"\btrading\b", r"\blegal\b",
                     r"\blaw\b", r"educat\w+", r"recommend\w+", r"social simulation", r"\bdata analy\w+",
                     r"spreadsheet", r"\bsql\b", r"customer"],
        "roots": [],
    },
    {
        "id": "systems",
        "label": "Efficiency & Agent Systems",
        "desc": "agent serving infrastructure, latency and cost, caching, scheduling, frameworks and protocols",
        "keywords": [r"latency", r"\bcost\b", r"efficien\w+", r"\bserving\b", r"throughput", r"\bcach\w+",
                     r"schedul\w+", r"infrastructure", r"\bruntime\b", r"token budget"],
        "roots": [],
    },
]

SURVEY_ROOTS = ["2308.11432", "2309.07864", "2402.01680"]
# Foundational papers that much of the field builds on but that don't match the "agent"
# query (e.g. Chain-of-Thought). They are added to the corpus so lineages can reach them.
EXTRA_LANDMARKS = ["2201.11903", "2203.11171", "2303.17651", "2303.17580"]
