import json
import re
import time
from difflib import SequenceMatcher
from pathlib import Path

import requests
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
EXAMPLE_CONFIG = ROOT / "config.example.json"


def load_config():
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(EXAMPLE_CONFIG.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Created {CONFIG_PATH.name}. Edit it if needed, then run again.")
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def norm(text):
    text = str(text or "").lower()
    text = re.sub(r"[^a-z0-9+\-. ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def similarity(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def unwrap_matches(payload):
    if isinstance(payload, list):
        return payload
    for key in ("matches", "data"):
        value = payload.get(key) if isinstance(payload, dict) else None
        if isinstance(value, list):
            return value
    return []


def read_car35_signals(url):
    response = requests.get(url, timeout=12, headers={"Cache-Control": "no-cache"})
    response.raise_for_status()
    rows = unwrap_matches(response.json())
    signals = []
    for row in rows:
        engine = row.get("engine") or {}
        decision = str(engine.get("decision") or row.get("decision") or row.get("state") or "").upper()
        if "SIGNAL" not in decision:
            continue
        signal = {
            "id": str(row.get("sourceMatchId") or row.get("id") or f"{row.get('home')}-{row.get('away')}"),
            "home": row.get("home") or "",
            "away": row.get("away") or "",
            "minute": engine.get("detectedMinute") or engine.get("entryMinute") or row.get("detectedMinute") or row.get("entryMinute") or row.get("minute"),
            "market": engine.get("market") or row.get("market") or "",
            "selection": engine.get("selectedTeam") or engine.get("pick") or row.get("selectedTeam") or "",
            "line": engine.get("selectedLine") if engine.get("selectedLine") is not None else engine.get("line"),
            "target_odds": engine.get("odds") or engine.get("lockedOdds") or row.get("lockedOdds") or row.get("oddsAtSignal"),
        }
        signals.append(signal)
    return signals


def lm_model(base_url, configured):
    if configured and configured != "auto":
        return configured
    response = requests.get(f"{base_url.rstrip('/')}/models", timeout=8)
    response.raise_for_status()
    models = response.json().get("data") or []
    if not models:
        raise RuntimeError("LM Studio is running but no model is available.")
    return models[0]["id"]


def lm_json(base_url, model, system, user):
    payload = {
        "model": model,
        "temperature": 0.0,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    response = requests.post(f"{base_url.rstrip('/')}/chat/completions", json=payload, timeout=45)
    response.raise_for_status()
    text = response.json()["choices"][0]["message"]["content"].strip()
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise RuntimeError(f"LM Studio did not return JSON: {text[:300]}")
    return json.loads(match.group(0))


def try_open_search(page):
    for label in ("Search", "search"):
        try:
            loc = page.get_by_text(label, exact=False)
            if loc.count():
                loc.first.click(timeout=1200)
                time.sleep(0.4)
                return True
        except Exception:
            pass
    return False


def find_search_input(page):
    selectors = [
        'input[type="search"]',
        'input[placeholder*="Search" i]',
        'input[aria-label*="Search" i]',
        '[class*="search" i] input',
    ]
    for selector in selectors:
        try:
            loc = page.locator(selector)
            if loc.count() and loc.first.is_visible():
                return loc.first
        except Exception:
            pass
    try_open_search(page)
    for selector in selectors:
        try:
            loc = page.locator(selector)
            if loc.count() and loc.first.is_visible():
                return loc.first
        except Exception:
            pass
    return None


def interactive_candidates(page, limit=220):
    items = []
    locator = page.locator('a,button,[role="button"]')
    count = min(locator.count(), limit)
    for i in range(count):
        node = locator.nth(i)
        try:
            if not node.is_visible():
                continue
            text = re.sub(r"\s+", " ", node.inner_text(timeout=500)).strip()
            if len(text) < 3:
                continue
            items.append({"index": i, "text": text[:320]})
        except Exception:
            continue
    return items


def candidate_score(text, home, away):
    return (similarity(home, text) + similarity(away, text)) / 2


def locate_event(page, signal, base_url, model, min_confidence):
    search = find_search_input(page)
    if search:
        try:
            search.fill(signal["home"])
            time.sleep(1.3)
        except Exception:
            pass

    candidates = interactive_candidates(page)
    if not candidates:
        return None, 0.0, "No clickable event candidates found"

    ranked = sorted(
        ((candidate_score(c["text"], signal["home"], signal["away"]), c) for c in candidates),
        key=lambda x: x[0], reverse=True,
    )
    if ranked[0][0] >= min_confidence:
        return ranked[0][1]["index"], ranked[0][0], "fuzzy"

    compact = ranked[:35]
    prompt_rows = "\n".join(f"{c['index']}: {c['text']}" for _, c in compact)
    decision = lm_json(
        base_url,
        model,
        "You match football event names. Return JSON only: {\"index\": integer|null, \"confidence\": 0..1, \"reason\": string}. Never invent an event not listed.",
        f"Target: {signal['home']} vs {signal['away']}\nCandidates:\n{prompt_rows}",
    )
    confidence = float(decision.get("confidence") or 0)
    if decision.get("index") is None or confidence < min_confidence:
        return None, confidence, decision.get("reason") or "LM uncertain"
    return int(decision["index"]), confidence, decision.get("reason") or "lm"


def click_candidate(page, index):
    locator = page.locator('a,button,[role="button"]')
    if index < 0 or index >= locator.count():
        return False
    node = locator.nth(index)
    try:
        node.scroll_into_view_if_needed(timeout=1500)
        node.click(timeout=2500)
        return True
    except Exception:
        return False


def analyze_market(page, signal, base_url, model, min_confidence):
    body = page.locator("body").inner_text(timeout=5000)
    body = re.sub(r"\n{3,}", "\n\n", body)
    clipped = body[:26000]
    result = lm_json(
        base_url,
        model,
        "You verify a football betting market from visible webpage text. Do not recommend a bet. Return JSON only with keys: found(boolean), confidence(0..1), market(string), selection(string), line(string|null), current_odds(number|null), status(one of MATCH, BELOW_TARGET, ABOVE_TARGET, NEEDS_REVIEW), evidence(string). Evidence must be copied from the supplied page text. If unsure, found=false and status=NEEDS_REVIEW.",
        "CAR3.5 target:\n"
        + json.dumps(signal, ensure_ascii=False)
        + "\n\nVisible 1xBet page text:\n"
        + clipped,
    )
    confidence = float(result.get("confidence") or 0)
    evidence = str(result.get("evidence") or "").strip()
    if confidence < min_confidence:
        result["found"] = False
        result["status"] = "NEEDS_REVIEW"
    if evidence and norm(evidence) not in norm(body):
        result["found"] = False
        result["status"] = "NEEDS_REVIEW"
        result["evidence"] = "LM evidence could not be verified against page text"
    return result


def add_overlay(page, signal, result):
    data = {
        "title": f"CAR 3.5 · {signal['home']} vs {signal['away']}",
        "target": f"{signal['selection']} | {signal['market']} | line {signal['line']} | target {signal['target_odds']}",
        "current": f"1xBet: {result.get('current_odds') if result.get('current_odds') is not None else '—'} | {result.get('status', 'NEEDS_REVIEW')}",
    }
    page.evaluate(
        """data => {
          let box=document.getElementById('car35-local-watcher');
          if(!box){
            box=document.createElement('div'); box.id='car35-local-watcher';
            Object.assign(box.style,{position:'fixed',right:'12px',top:'12px',zIndex:'2147483647',background:'#111',color:'#fff',padding:'12px 14px',border:'2px solid #f3c623',borderRadius:'10px',font:'700 13px Arial',maxWidth:'420px',boxShadow:'0 10px 30px rgba(0,0,0,.45)'});
            document.body.appendChild(box);
          }
          box.innerHTML=`<div style="color:#f3c623;margin-bottom:5px">${data.title}</div><div>${data.target}</div><div style="margin-top:5px">${data.current}</div><div style="margin-top:7px;color:#aaa;font-size:11px">Read-only helper — stake and confirmation remain manual.</div>`;
        }""",
        data,
    )


def signal_key(signal):
    return "|".join(str(signal.get(k) or "") for k in ("id", "minute", "selection", "market", "line", "target_odds"))


def main():
    cfg = load_config()
    base_url = cfg["lm_studio_base_url"]
    model = lm_model(base_url, cfg.get("lm_model", "auto"))
    print(f"LM Studio model: {model}")
    print("CAR3.5 -> 1xBet watcher. No stake entry and no confirmation clicks are implemented.")

    profile = str((ROOT / cfg.get("browser_profile_dir", ".browser-profile")).resolve())
    seen = set()

    with sync_playwright() as p:
        launch_args = {
            "user_data_dir": profile,
            "headless": bool(cfg.get("headless", False)),
            "viewport": None,
            "args": ["--start-maximized"],
        }
        channel = cfg.get("browser_channel")
        if channel:
            launch_args["channel"] = channel
        context = p.chromium.launch_persistent_context(**launch_args)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(cfg["bookmaker_url"], wait_until="domcontentloaded", timeout=45000)
        print("1xBet opened. Log in manually in this browser profile if needed.")

        while True:
            try:
                signals = read_car35_signals(cfg["car35_live_url"])
                for signal in signals:
                    key = signal_key(signal)
                    if key in seen:
                        continue
                    seen.add(key)
                    print("\nNew CAR3.5 SIGNAL:", json.dumps(signal, ensure_ascii=False))

                    if "1xbet" not in page.url.lower():
                        page.goto(cfg["bookmaker_url"], wait_until="domcontentloaded", timeout=45000)

                    idx, confidence, source = locate_event(
                        page, signal, base_url, model, float(cfg.get("minimum_match_confidence", 0.72))
                    )
                    if idx is None:
                        print(f"Event not opened: confidence={confidence:.2f} ({source})")
                        continue

                    print(f"Event candidate confidence={confidence:.2f} ({source})")
                    if not click_candidate(page, idx):
                        print("Could not open event candidate. Leaving 1xBet page for manual review.")
                        continue

                    try:
                        page.wait_for_load_state("domcontentloaded", timeout=5000)
                    except PlaywrightTimeoutError:
                        pass
                    time.sleep(1.2)

                    result = analyze_market(
                        page, signal, base_url, model, float(cfg.get("minimum_market_confidence", 0.70))
                    )
                    print("Market check:", json.dumps(result, ensure_ascii=False))
                    try:
                        add_overlay(page, signal, result)
                    except Exception:
                        pass
                    print("Page left open for you. Amount entry and final confirmation are manual.")

                time.sleep(max(5, int(cfg.get("poll_seconds", 10))))
            except KeyboardInterrupt:
                break
            except Exception as exc:
                print("Watcher error:", exc)
                time.sleep(5)

        context.close()


if __name__ == "__main__":
    main()
