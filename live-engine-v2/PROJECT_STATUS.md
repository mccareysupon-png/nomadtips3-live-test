# Live Engine V2 Project Status

Project lead: Add K
Owner: NOMADTIPS3 Owner

## Current phase

Phase 1 — Collector Foundation

## Locked architecture

API-Football -> Single Collector -> Shared Snapshot/Cache -> Condition Engine -> Cloudflare D1 -> Public Viewer / Owner Settings / PAPER Lab

## Leadership rules

- One upstream API-Football caller for Live Engine V2.
- No browser, public page, owner page, PAPER page, GitHub Action, or secondary worker may independently poll the same live upstream data once V2 cutover is complete.
- Build and verify each phase before enabling the next.
- Production Car 1 remains out of scope unless the Owner explicitly authorizes integration.
- PAPER remains the execution boundary for this project.

## Active work order

1. Verify Collector foundation.
2. Add local candidate filtering.
3. Add statistics/odds only for shortlisted candidates.
4. Add D1 ingest and shared stored state.
5. Build public read-only viewer.
6. Build owner-only settings surface.
7. Connect PAPER signal flow.
8. Deploy Collector to VPS.
9. Disable duplicate legacy live upstream callers.
10. Run cutover verification.

## Owner action currently required

Create the small Ubuntu VPS that will host the Collector when instructed. Do not change Production or disable the existing live engine yet.

## Definition of done

- Exactly one Live Engine V2 upstream collector is active.
- Browser traffic does not increase API-Football calls.
- Public viewer reads stored state only.
- Owner settings are server-side protected.
- Collector telemetry reflects real provider response headers.
- Legacy duplicate live callers are disabled only after V2 passes verification.
