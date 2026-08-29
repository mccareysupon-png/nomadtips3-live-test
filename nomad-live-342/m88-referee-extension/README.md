# NOMAD 3.42 M88 Referee Bridge

Read-only Chrome MV3 bridge for the M88/MSports referee path.

## Flow

`MSports guest page -> MAIN-world XHR/fetch observer -> isolated bridge -> extension background -> NOMAD 3.42 bridge -> nomad:m88-collector-payload -> NOMADM88 pool -> existing 3.42 Judge`

The bridge does not submit bets, open a bet slip, log in, persist cookies/tokens/session values, or send raw request bodies.

## Files

- `m88-main-hook.js` — observes JSON returned through the page's existing `XMLHttpRequest`/`fetch`, extracts only known referee fields, and emits `m88:referee-update` when line/odds/score/period changes. A minute-only change does not emit.
- `m88-bridge.js` — runs in the extension isolated world and forwards only allow-listed normalized fields.
- `background.js` — keeps the latest payload per `event_id` in `chrome.storage.session` and relays updates to open NOMAD 3.42 tabs.
- `nomad-bridge.js` — dispatches each payload into the page as `nomad:m88-collector-payload`.

## Install for test

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this `m88-referee-extension` folder.
4. Open M88/MSports Live Football as guest.
5. Open the Git 3.42 page in another tab.
6. Leave both tabs open and watch the 3.42 M88 observation / decision state.

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
- FH payload may reach the observer but the 3.42 adapter rejects it for final FT-AH judging.
- Unsigned non-zero HOME HDP remains UNKNOWN in the existing 3.42 decoder unless the source payload itself provides a safe sign.
- Stale observations are rejected by the existing freshness gate.

## Existing Work collector compatibility

If the separate Work collector already produces the `m88-msports-referee` schema, it can bypass `m88-main-hook.js` and dispatch its normalized payload as:

```js
window.dispatchEvent(new CustomEvent('m88:referee-update', { detail: payload }));
```

The remaining extension bridge and 3.42 Judge path stay unchanged.
