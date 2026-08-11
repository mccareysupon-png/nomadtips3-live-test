def _number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip().replace("%", "").replace(",", ".")
    try:
        number = float(text)
    except ValueError:
        return None
    return int(number) if number.is_integer() else number


def _stat_key(name):
    key = "".join(ch for ch in str(name or "").lower() if ch.isalnum())
    return {
        "attacks": "attacks",
        "dangerousattacks": "dangerous_attacks",
        "totalshots": "shots",
        "shotsongoal": "shots_on_target",
        "shotsontarget": "shots_on_target",
        "cornerkicks": "corners",
        "ballpossession": "possession",
        "redcards": "red_cards",
        "yellowcards": "yellow_cards",
        "fouls": "fouls",
        "offsides": "offsides",
    }.get(key)


def compact_statistics(item):
    teams = item.get("teams") or {}
    home_id = ((teams.get("home") or {}).get("id"))
    away_id = ((teams.get("away") or {}).get("id"))
    output = {}

    for team_block in item.get("statistics") or []:
        team_id = ((team_block.get("team") or {}).get("id"))
        if team_id == home_id:
            side = "home"
        elif team_id == away_id:
            side = "away"
        else:
            continue

        for row in team_block.get("statistics") or []:
            key = _stat_key(row.get("type"))
            if not key:
                continue
            output.setdefault(key, {"home": None, "away": None})
            output[key][side] = _number(row.get("value"))

    return output


def compact_fixture_detail(item):
    fixture = item.get("fixture") or {}
    return {
        "fixture_id": fixture.get("id"),
        "updated_at": fixture.get("timestamp"),
        "statistics": compact_statistics(item),
    }


def compact_fixture_details(indexed):
    return {
        int(fixture_id): compact_fixture_detail(item)
        for fixture_id, item in indexed.items()
    }


def compact_live_odds(indexed):
    output = {}
    for fixture_id, item in indexed.items():
        fixture = item.get("fixture") or {}
        status = item.get("status") or {}
        output[int(fixture_id)] = {
            "fixture_id": int(fixture_id),
            "minute": ((fixture.get("status") or {}).get("elapsed")),
            "updated_at": item.get("update"),
            "stopped": bool(status.get("stopped", False)),
            "blocked": bool(status.get("blocked", False)),
            "finished": bool(status.get("finished", False)),
            # Keep provider market structure only for shortlisted fixtures.
            # The condition engine will extract the configured market later.
            "odds": item.get("odds") or [],
        }
    return output
