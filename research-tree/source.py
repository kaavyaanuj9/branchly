"""The literature source for this instance, chosen by the field profile (config.SOURCE).

Every source module offers the same interface: poll_new, backfill, backfill_history,
fetch_ids, next_announcement, last_announcement, in_hot_window, day0_refs, UA, _get.
"""
import config

if config.SOURCE == "biorxiv":
    import biorxiv as _src
else:
    import ingest as _src

poll_new = _src.poll_new
backfill = _src.backfill
backfill_history = _src.backfill_history
fetch_ids = _src.fetch_ids
next_announcement = _src.next_announcement
last_announcement = _src.last_announcement
in_hot_window = _src.in_hot_window
is_relevant = _src.is_relevant
UA = _src.UA
_get = _src._get
CONTINUOUS = getattr(_src, "CONTINUOUS", False)
POLL_SECONDS = getattr(_src, "POLL_SECONDS", config.POLL_SECONDS)


def day0_refs(pid, title_index):
    """References available the day a paper appears: arXiv HTML or bioRxiv JATS XML."""
    if hasattr(_src, "day0_refs"):
        return _src.day0_refs(pid, title_index)
    import refs
    return refs.html_refs(pid, title_index)
