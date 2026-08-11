# Live Engine V2 Build Plan

## Recommended build order

### Phase 0 — Lock architecture

Owner outcome: one upstream caller, one shared state stream.

Done in repository:
- V2 folder created.
- Architecture documented.
- Old live system remains isolated.

### Phase 1 — Collector foundation

Assistant/code tasks:
- Add async API client.
- Add live fixture heartbeat.
- Add atomic snapshot file.
- Add provider rate-limit telemetry.
- Add graceful 204/429/5xx handling.

Owner external task:
- Provide the API key only in the runtime `.env` or VPS secret store. Never commit it to GitHub.

Exit test:
- Collector runs for 15+ minutes.
- Live count changes correctly.
- `snapshot.json` updates.
- Requests stay well below plan limits.
- No browser is involved.

### Phase 2 — Candidate filtering

Assistant/code tasks:
- Add active condition config model.
- Filter by live status, minute, score state and goal gap before any detail calls.
- Persist candidate state.

Owner external task:
- Confirm the condition values through the Owner Settings page once that page exists.

Exit test:
- Large live fixture set shrinks locally before detail requests.
- Changing conditions does not cause a full upstream rescan.

### Phase 3 — Statistics and in-play odds

Assistant/code tasks:
- Add statistics only for shortlisted fixtures.
- Batch fixture detail where supported.
- Cache statistics based on upstream freshness.
- Add `/odds/live` only if the active rule requires odds and candidates exist.
- Store odds snapshots that are needed for later analysis because in-play odds have no history upstream.

Owner external task:
- None beyond keeping the API subscription active.

Exit test:
- No candidates = zero stats/odds calls.
- No odds condition = zero odds calls.
- Repeated evaluation of the same snapshot = zero extra upstream calls.

### Phase 4 — Cloudflare D1 ingest

Assistant/code tasks:
- Add an authenticated ingest endpoint in the existing Cloudflare Worker.
- Store latest fixture/candidate/signal state in D1.
- Add read-only API for the public page.
- Add owner config API with server-side authorization.

Owner external task:
- Add the ingest secret and owner-auth secret to Cloudflare environment settings when instructed.

Exit test:
- Refreshing the web page never increases API-Football calls.
- D1 contains the latest normalized state.

### Phase 5 — Web UI

Assistant/code tasks:
- Build Public Viewer using `m88-execution-lab/UI_STYLE.md` and `WEB_UI_SPEC.md`.
- Build Owner Settings as a separate authenticated surface.
- Keep UI compact, near-black, minimal-border and NOMADTIPS3 green.

Owner external task:
- Test the pages on desktop and mobile.

Exit test:
- Public viewer is read-only.
- Owner settings can update versioned scanner config.
- No secret appears in frontend code.

### Phase 6 — PAPER integration

Assistant/code tasks:
- Send normalized signals to the existing PAPER execution lab.
- Keep signal dedupe and audit history.
- Display recent PAPER outcomes in the public/owner views as configured.

Owner external task:
- Review PAPER results before any future expansion.

Exit test:
- One signal creates one PAPER record.
- Restart does not duplicate signals.

### Phase 7 — VPS deployment

Owner external task:
- Create a small Ubuntu VPS with a stable public IP.
- Add an SSH key.
- Send only the VPS public IP and confirmation that SSH login works; do not send private SSH keys.

Assistant/code tasks after VPS exists:
- Provide exact install commands.
- Install Python runtime and project dependencies.
- Configure service startup.
- Configure log rotation/health checks.
- Move the same Collector from test runtime to VPS without changing architecture.

Exit test:
- Collector auto-starts after reboot.
- Scanner works with the user PC turned off.
- Only V2 owns upstream live scanning.

### Phase 8 — Cutover

Assistant/code tasks:
- Verify V2 telemetry against provider response headers.
- Disable previous Car 3 upstream scheduler/callers that duplicate V2.
- Leave rollback code intact but inactive.

Exit test:
- Exactly one upstream live collector is active.
- Public/owner pages continue working through D1.
- No duplicate upstream caller remains.

## Owner tasks summary

The Owner should only need to do external account/machine steps that cannot be done from this repository:

1. Keep API-Football subscription active.
2. Put API key into runtime secret storage when instructed.
3. Create the VPS when Phase 7 is reached.
4. Add SSH key to the VPS account.
5. Add Cloudflare secrets when Phase 4 is reached.
6. Test the final public and owner pages.

Everything else should be implemented and checked in the repository first.
