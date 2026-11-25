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

---

## 2026-11-25: Working Cloudflare-native transport for Dot (no custom GET or custom bearer)

The earlier Dot profile reported `CONNECTION_NOT_CONFIGURED` because the connected Cloudflare plugin cannot make an arbitrary authenticated request to the Worker `workers.dev` URL. That blocker is bypassed by **private Cloudflare Workers KV account API access**.

The existing TEST Worker saves the same sanitized 42-formula report to private KV on the **actual 15-minute scheduled Adaptive O/U run**, after both Risk Guard checks; no extra provider call, no owner session, and no public endpoint.

- KV namespace: `BALL46_ADAPTIVE_DOT_RISK_TEST_READONLY_20261125`
- Namespace ID (not a secret): `c3ce9ac5641a45cca03ec318a35c6872`
- Key: `adaptive-risk-supervisor/latest-v1-test`
- Account API: `GET /accounts/{account_id}/storage/kv/namespaces/c3ce9ac5641a45cca03ec318a35c6872/values/adaptive-risk-supervisor%2Flatest-v1-test`
- Use the Dot's **Cloudflare Connector** normal authorized API request. **Do not provide an owner password or a bearer token in chat.**
- Successful Cloudflare connector test: read JSON string directly through `cloudflare.request`. It returned 42 formulas, 115 FT-verified decisions, Risk Guard checked 42 before/after, and no raw fixture Ledger rows.
- `snapshotRecordedAt`, `staleAfter`, `freshness.cronCompletedAt`, `freshness.cronInvocationId` provide cross-round proof and age limits. KV is eventually consistent; read-age validation is mandatory.
- The reporting key expires after 2400 seconds without a replacement; a missing key, transport error, stale timestamp, or status other than OK means **UNAVAILABLE** or **STALE**, never 0.

### Exact operation using existing Cloudflare Connector

```js
async () => {
  const ns = 'c3ce9ac5641a45cca03ec318a35c6872';
  const key = 'adaptive-risk-supervisor%2Flatest-v1-test';
  const path = `/accounts/${accountId}/storage/kv/namespaces/${ns}/values/${key}`;
  try {
    // Cloudflare KV API returns raw JSON text, NOT a Cloudflare success/result envelope.
    const raw = await cloudflare.request({method:'GET',path});
    const data = JSON.parse(raw);
    if(data.status!=='OK'||!Array.isArray(data.formulas)||
       data.formulas.length!==42||Date.parse(data.staleAfter)<=Date.now()||
       data.freshness?.cronSource!=='CLOUDFLARE_SCHEDULED_15M'||
       data.freshness?.cronRiskGuardBefore?.checked!==42||
       data.freshness?.cronRiskGuardAfter?.checked!==42)
      return {status:'UNAVAILABLE_OR_STALE',reason:'missing/stale/invalid Risk Guard snapshot'};
    return {status:'OK',freshness:data.freshness,summary:data.summary,formulas:data.formulas};
  } catch(error) {
    return {status:'UNAVAILABLE',reason:'Cloudflare KV data cannot be read'};
  }
}
```

### Permission boundary and Dot scheduling

Cloudflare's native KV GET accepts a token with **Workers KV Storage Read**, ideally restricted to this namespace. Do not rely on an account-wide Worker-management credential for an enforceably read-only Dot identity. If the existing Dot connector is authorized for writes, it is technically broader than the requested monitor-only role. Reauthorize a *separate least-privilege* Cloudflare connection where the app supports it; otherwise leave scheduled Dot monitoring unconfigured and request explicit acceptance of the risk.

After confirming a real automatic KV refresh from a new 15-minute cron (different `cronInvocationId`), and confirming Dot's own Cloudflare connection can make the KV GET with an appropriately scoped credential, the Dot may be authorized to monitor hourly and summarize at 06:05 Europe/London. Never call RUN or PAUSE. Do not configure Dot jobs from GitHub Actions or describe the ChatGPT assistant's connection as Dot's connection.

### Free-tier footprint

One KV `put` per 15-minute tick is nominally **96 writes per day**, within the documented 1,000 writes per day Workers KV Free allowance **if other KV writes on the same account remain within the total limit**. No extra odds provider calls are introduced. This does not guarantee zero billing if the account uses a paid tier or exceeds included allowances.
