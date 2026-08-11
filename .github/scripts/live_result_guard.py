"""Monotonic score/status reconciliation for selected NOMAD matches.

API providers can briefly return an older or incomplete fixture snapshot.  A
confirmed terminal result must never be reopened as a live/not-started match,
because that would re-add the file to the active polling queue and block the
next automatic selection rollover.
"""

DEFAULT_TERMINAL = {"FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO", "PST"}


def _mapping(value):
    return value if isinstance(value, dict) else {}


def _keep(new_value, old_value):
    return old_value if new_value is None or new_value == "" else new_value


def _score_pair(new_value, old_value):
    new_value = _mapping(new_value)
    old_value = _mapping(old_value)
    return {
        "home": _keep(new_value.get("home"), old_value.get("home")),
        "away": _keep(new_value.get("away"), old_value.get("away")),
    }


def reconcile_match_state(previous_match, fixture_status, goals, score, terminal_statuses=None):
    """Merge one provider fixture snapshot without allowing terminal rollback."""

    terminal = set(terminal_statuses or DEFAULT_TERMINAL)
    previous_match = _mapping(previous_match)
    fixture_status = _mapping(fixture_status)
    goals = _mapping(goals)
    score = _mapping(score)

    previous_status = str(previous_match.get("status") or "").upper()
    provider_status = str(fixture_status.get("short") or "").upper()
    effective_provider_status = provider_status or previous_status or "NS"
    regression_blocked = previous_status in terminal and effective_provider_status not in terminal

    if regression_blocked:
        return {
            "status": previous_status,
            "status_long": previous_match.get("status_long") or "Match Finished",
            "elapsed": previous_match.get("elapsed"),
            "score": _score_pair(previous_match.get("score"), {}),
            "halftime_score": _score_pair(previous_match.get("halftime_score"), {}),
            "fulltime_score": _score_pair(previous_match.get("fulltime_score"), previous_match.get("score")),
            "terminal_regression_blocked": True,
        }

    provider_fulltime = score.get("fulltime")
    if effective_provider_status in terminal:
        # Some final provider snapshots contain the final goals immediately but
        # populate score.fulltime a little later. Prefer those final goals over
        # a stale full-time pair from the preceding live snapshot.
        provider_fulltime = _score_pair(provider_fulltime, goals)

    return {
        "status": effective_provider_status,
        "status_long": fixture_status.get("long") or previous_match.get("status_long"),
        "elapsed": _keep(fixture_status.get("elapsed"), previous_match.get("elapsed")),
        "score": _score_pair(goals, previous_match.get("score")),
        "halftime_score": _score_pair(score.get("halftime"), previous_match.get("halftime_score")),
        "fulltime_score": _score_pair(provider_fulltime, previous_match.get("fulltime_score")),
        "terminal_regression_blocked": False,
    }
