"""Field profiles: which literature a Research Tree instance covers.

RT_FIELD selects one (default: llm_agents). Each instance keeps its own data in
data/<slug>/ and serves on its own port, so several fields can run side by side.
"""
import importlib
import os

FIELD = importlib.import_module(f"fields.{os.environ.get('RT_FIELD', 'llm_agents')}")
