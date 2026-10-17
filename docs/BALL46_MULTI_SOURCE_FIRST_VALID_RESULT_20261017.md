# BALL46 — extensible multi-source final-result pipeline (2026-10-17)

**Status: DESIGN + READ-ONLY MODULE, PREPARATION BRANCH ONLY; NO PRODUCTION WRITER OR DEPLOY.**

## Agreed business rule

- **5USD stays the primary live engine:** fixtures, live state, in-play odds, signals, betting markets, and scan conditions are untouched.
- **All configured final-score sources participate:** 5USD, Goaloo, and later providers are peers **for football FT score evidence only**.
- **First valid verified final result wins**, not first HTTP reply and not source-based priority. A result is eligible only after that source meets its validation and stability gates. There is no special wait for 5USD/backoff.
- **Ball46 existing settlement engine remains the only judge** for WIN/LOSS/PUSH/half results, Units, Statistics and Member. Never recompute P/L in an adapter.
- Re-check PENDING in a single atomic/idempotent settlement operation; if already settled, ignore late results and keep an audit record of disagreement. No duplicated settlement.

## Durable fixture mapping (important)

At initial fixture discovery through 5USD, persist this canonical identity:

    ball46FixtureId, home, away, league, kickoffUtc,
    sourceFixtureIds: { "5usd": "...", "goaloo": "...", "futureSource": "..." },
    mappingVerifiedAt, identityVersion, aliasesAndEvidence

The record must outlive the rolling live Hub snapshot. Prior live shadow detected stable FT games in Goaloo whose fixture records were no longer present in the Hub current snapshot. **Do not rely on names alone** when historical kickoff or league details are missing. Review new explicit aliases instead of fuzzy guessing.

## Provider adapter contract

Each provider adapter normalizes provider-specific data to the same evidence structure. Example for illustration only:

    {
      "source": "goaloo",
      "sourceFixtureId": "3019157",
      "home": "Home FC", "away": "Away FC",
      "league": "Correct League",
      "kickoffUtc": "2026-10-17T12:00:00Z",
      "phase": "FT", "scoreScope": "REGULATION_90",
      "score": {"home": 2, "away": 0},
      "receivedAt": "2026-10-17T13:35:00Z"
    }

receivedAt MUST be the trusted collection time set by our system, never a provider-supplied timestamp. An unverified raw timezone is not an accepted kickoffUtc. Provider configuration declares its capabilities, required samples, stability gap, provider league aliases and fixture ID mapping. New providers can be added without rewriting the settlement judge.

Currently proposed (read-only) policies:
- 5USD: FT_SCORE, at least one independently valid provider FT snapshot.
- Goaloo: FT_SCORE, at least two identical provider FT score observations separated by >=60 seconds.
- Future third/fourth providers: explicit independently reviewed stability settings, same result schema, verified persistent fixture mapping.

## Read-only evaluation -> existing engine

1. Collect 5USD and Goaloo independently (neither blocks the other).
2. Match only to a durable canonical Ball46 fixture; validate source ID, HOME/AWAY orientation, league, original UTC kickoff, explicit FT and credible 90-minute goals.
3. For each source track the earliest **eligible** result timestamp (all its safety gates passed).
4. Propose the earliest eligible source and its 90-minute score to the existing judge. If simultaneous valid but contradictory results: HOLD.
5. Existing judge must atomically confirm that **each target signal remains PENDING** before native settlement; never change locked picks/odds.
6. Maintain idempotency by immutable signal identity and claim version; use source audit logs for repeats/disagreements. If the production store cannot atomically commit both claim and settlement, design a durable, serialized owner-specific solution first.
7. Member1 and Statistics continue reading existing Engine state. No new UI/Member settlement.
8. Only a source which explicitly supplies **verified final corners totals** can settle Corners. FT_SCORE alone never qualifies, regardless of provider.

**Examples:** 5USD final qualifies at 13:30; Goaloo stable result qualifies 13:31 => 5USD wins. Goaloo qualifies 13:30; 5USD first FT at 13:32 => Goaloo wins. Third source later joins with verified map and passes at 13:29 => it wins. Later conflicting scores are audited, never overwrite SETTLED.

## Staging code and checks

- Pure, no-side-effects router: integrations/result-provider-router/router.mjs
- Unit test suite: integrations/result-provider-router/test/router.test.mjs
- Test: node --test integrations/result-provider-router/test/router.test.mjs
- No network, DB, Worker writer, cron or deployment in this module.

## Live-release prerequisites (NOT YET DONE)

1. Identify the **currently deployed** Engine343 settlement source/version and authoritative PENDING ledger. Repository code from a related worker or Member1 is not evidence of the current deployed settlement writer.
2. Persist original fixture identity and cross-provider ID mappings, including completed matches missing from live Hub.
3. Certify provider kickoff UTC conversions, source access rights, exact final-scope semantics and real mismatches.
4. Test parallel arrivals and atomic PENDING-to-SETTLED integration on an isolated cloned dataset. Prove no duplicate Units/Statistics, no manipulation of selection history, and no Corners data fabrication.
5. Audit and authorize the exact production release and rollback under .github/BALL46_PRODUCTION_FIREWALL.md. Never deploy from preview or an unconfirmed branch.

**Change scope:** preparation branch ONLY. No production site, Member, 5USD engine, in-play odds, D1 or statistics have been changed.
