# STEP 04D — Central Hub Live Gate

Status: GREEN for live data/adapter gate. Production Central Hub is still isolated and not connected to 3.41 or 3.43.

## Final successful gate

GitHub Actions run: 34736533358
Commit: 881c34b5c0e9c9f4b54b36dbe32de82c74fdbdfa
Conclusion: SUCCESS

### Passed checks

- Hub syntax check: PASS
- Hub contract tests: 9/9 PASS
- Ephemeral Cloudflare Worker boot: PASS
- `/health`: PASS
- Unauthorized `/live` without token returns 401: PASS
- Live fixture identity parity: PASS
  - Hub fixtures: 14
  - Direct 5USD page-1 fixtures: 14
  - Shared fixture IDs: 14
  - Parity ratio: 1.00
  - Team identity check: PASS
- Bet365 full-market `/odds`: PASS
- Referee Bus `/referees`: PASS
  - Referee sockets returned: 10
  - Expected identities present: 10/10
  - Test fixture: 201096780
  - AH READY on this fixture at this observation: 3/10
  - Note: READY is market/fixture availability, not socket identity. Missing live AH must remain unavailable rather than fabricated.
- Cache hit within 55s TTL: PASS
  - observed cache age: 947 ms
- Cache refresh after TTL: PASS
  - stale=false
  - fresh live fixture count at refresh: 13

## Safety state

- Hub remains data-only; no signal and no settlement route.
- 10 referees remain `shadowOnly=true` and `voteEligible=false`.
- `sourceUpdatedAt` is not fabricated from Hub time.
- `observedAt` / `lastChangedAt` remain Hub observation timestamps only.
- 3.41 Production files remain untouched.
- 3.43 direct 5USD remains signal authority; Central Hub shadow cannot affect signals.

## Resolved gate issues

1. Wrangler 4.92.0 could not boot compatibility date 2026-09-13. Gate updated to Wrangler 4.131.1; Worker boot passed.
2. Inline YAML heredoc caused a false CI failure after live parity had already passed 15/15. Gate now uses `rewire-341-5usd/validate-hub-gate.mjs`; rerun passed fully.

## Remaining operational blocker

A persistent production Central Hub Worker still requires secure binding of `FIVEDOLLAR_API_KEY`. The current connector security layer blocks creating a new workflow that writes the secret into a new Worker. Do not bypass this by storing the API key as a plaintext Worker variable.

Until secure secret binding is available, do not switch 3.43 authority from direct 5USD to Central Hub and do not connect 3.41 Production.
