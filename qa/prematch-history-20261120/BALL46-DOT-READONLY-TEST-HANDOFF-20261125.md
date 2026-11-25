# BALL46 Adaptive Risk Supervisor — Dot read-only TEST handoff

> Scope: TEST only. Owner controls and Auto Stop in Cloudflare remain the only controls. Dot is **monitor/notify only**.

## Secure endpoint

- Method: `GET`
- Endpoint: `https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev/adaptive-dot-risk-read-test`
- Authentication: distinct **Dot Reader** bearer credential. Worker stores only a SHA-256 verification hash as secret binding `B46_ADAPTIVE_DOT_READ_HASH`.
- No owner Manual Control cookie or password. Never put tokens in ChatGPT messages, URLs, code, GitHub files, logs or screenshots.
- This endpoint does not allow `POST`, `PUT`, `PATCH`, or `DELETE`. The reader credential cannot access owner controls or legacy Dot PAUSE commands.
- No cross-origin access and no HTTP caching. It **does not return the raw prediction Ledger or fixture data**.

**Important setup dependency:** The reader credential has been provisioned for secure independent CI tests. There is **no established custom HTTP-reader secret connection inside the Dot** from this conversation. The Dot owner must approve a supported connection capable of securely storing a bearer credential and issuing authenticated GET requests. Do not improvise by pasting the token into a chat, exposing a browser URL parameter, or reusing the owner password. If no supported connection is available, leave Dot monitoring disabled and report `CONNECTION_NOT_CONFIGURED`.

## Response contract

- HTTP **200**, `status: OK`: recent successful `*/15 * * * *` Cloudflare scheduled invocation and both Risk Guard passes recorded in the TEST Durable Object.
- HTTP **503**, `status: UNAVAILABLE`: missing/invalid cron evidence, missing worker run timestamp, inconsistent source, or read error. `formulas: null`, `summary: null`.
- HTTP **503**, `status: STALE`: last completed actual Cron Risk Guard or last Worker run older than **35 minutes**. `formulas: null`, `summary: null`.
- HTTP **503**, `status: DATA_QUALITY_ERROR`: one or more settled entries lack verified FT evidence. `formulas: null`, `summary: null`.
- HTTP **401**: bad/missing reader credential; HTTP **405**: non-GET method.

With `OK`, the response includes `summary.totalFormulas=42`, running, pausedManual, pausedAuto, autoStopEnabled, verifiedFTDecisions, recordedObservations, and after-pause shadow counts.

Each entry in `formulas` contains formula ID; RUN/PAUSED mode; autoStopEnabled and configured DD/min-settled thresholds; wins, losses, verifiedFTSettled, pending, P/L (research units), currentDDU (current risk epoch), maxDDU (lifetime verified history), risk-epoch maxDD, Shadow picks **selected after the pause**, lastEvidenceAt, and sample/data-quality annotations.

A formula without any observations is flagged `NO_OBSERVATIONS`; it must never be ranked as a 0% win-rate failure. Research results across formulas can refer to the same fixture and do not equal an actual portfolio P/L.

## Evidence and guardrails

- Workers execute `applyAdaptiveAutoStops()` before and after each Adaptive O/U evaluation. The Worker persists a `CLOUDFLARE_SCHEDULED_15M` heartbeat with completed timestamp and both Risk Guard checked counts **only when the scheduled path executes successfully**.
- A console message or cron configuration alone is **not** accepted as proof of actual execution.
- User-triggered HTTP requests or ad-hoc tests must **not** manufacture scheduled Cron evidence.
- The Owner Manual Control is unchanged and owner-defined Auto Stop continues in Worker.
- Dot must never call any writer endpoint or use owner credentials.
- No paid API or additional odds provider calls.

## One-time connection in Dot (user action)

1. In the Dot profile, review **Customize → Plugins**, and connect a trusted integration that supports *authenticated HTTP GET with a managed secret*, using its secure authorization UI.
2. Grant read-only access to this TEST endpoint, **not** the owner Manual Control route. Put the reader credential only into that integration's secret vault, never in chat.
3. Have Dot run one immediate GET and verify HTTP 200, status OK, exactly 42 formulas, `freshness.cronSource=CLOUDFLARE_SCHEDULED_15M`, and Risk Guard before/after both checked 42.
4. Have Dot run a second independent check after the next real 15-minute Cron, confirm a new `cronInvocationId` and fresh timestamps without an open owner tab. If stale, unavailable, or credentials unavailable, **stop** and notify; do not guess or turn errors into zeros.
5. **Only after tests and explicit owner approval**, ask Dot to create an hourly read-and-notify task. Schedule a London daily summary at **06:05 Europe/London** (automatic GMT/BST adjustment). Keep writer permissions disabled.

## Dot behavior after owner approval

Monitor 42 formula states, age/health, FT-confirmed W/L and settled counts, research P/L, current DD, lifetime DD, after-pause shadow, and risk alerts. Report failures and changes, not routine noise. Do not make betting decisions or issue any RUN/PAUSE command.

**Caveat:** Existing separate public TEST research views may display historical research observations for UI use; this NEW read-only Dot endpoint does not expose the full Ledger. Securing those pre-existing public views requires a separate coordinated UI access-control change and must not be claimed complete by this patch.
