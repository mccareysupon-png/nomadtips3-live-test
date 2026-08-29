# NOMAD 3.42 M88 Referee Bridge

Read-only Chrome MV3 bridge for the M88/MSports referee path.

## Flow

`MSports guest page -> MAIN-world XHR/fetch observer -> isolated bridge -> extension background -> NOMAD 3.42 bridge -> nomad:m88-collector-payload -> NOMADM88 pool -> existing 3.42 Judge`

The bridge does not submit bets, open a bet slip, log in, persist cookies/tokens/session values, or send raw request bodies.

## Files

- `m88-main-hook.js` — observes JSON returned through the page's existing `XMLHttpRequest`/`fetch`, extracts only known referee fields, and emits `m88:referee-update` when line/odds/score/period changes. A minute-only change does not emit.
- `m88-bridge.js` — runs in the extension isolated world and forwards only allow-listed normalized FT-AH fields.
- `background.js` — keeps the latest payload per `event_id` in `chrome.storage.session` and relays updates to open NOMAD 3.42 tabs.
- `nomad-bridge.js` — waits for the 3.42 M88 observer ready handshake, then dispatches cached/live payloads as `nomad:m88-collector-payload`.

## Local branch test

The feature branch is intentionally not merged/deployed. Test it locally:

1. Check out `feat/342-m88-referee-adapter` on the Work PC.
2. From the repository root run a local static server, for example `python -m http.server 8080`.
3. Open `http://127.0.0.1:8080/nomad-live-342/index.html`.
4. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `nomad-live-342/m88-referee-extension`.
5. Reload the local NOMAD tab after loading/reloading the extension.
6. Open M88/MSports Live Football as guest and leave the live football page open.
7. Watch the local 3.42 M88 observation/decision state while FT AH prices change.

The observer/bridge startup race is handled by a ready handshake plus cache replay. MAIN/isolated CustomEvent payloads are serialized as JSON strings to avoid sharing object references across worlds.

## Pass criteria

A live test is considered passed only when all of these are observed from a real MSports response:

- real `event_id`
- real `market_id`
- real `selection_id`
- FT Asian Handicap Home/Away line
- Home/Away raw Hong Kong odds
- at least one live price/line change for the same identity
- 3.42 receives the update and the existing Judge returns the expected `M88 PRICE CONFIRMED` or fail-closed WAIT reason

Fixture/unit-test payloads do not count as live proof.

## Fail-closed behavior

- Missing event/market/selection identity: no payload emitted.
- Unknown market segment: no payload emitted.
- Non-soccer payload when `sport_id` is present and not `10`: ignored.
- FH payload is rejected before it enters the final FT-AH referee path.
- Unsigned non-zero HOME HDP remains UNKNOWN in the existing 3.42 decoder unless the source payload itself provides a safe sign.
- Stale observations are rejected by the existing freshness gate.

## Existing Work collector compatibility

If a separate collector already produces the `m88-msports-referee` schema, it can bypass `m88-main-hook.js` and dispatch its normalized payload as `m88:referee-update`. The remaining extension bridge and 3.42 Judge path stay unchanged.
