# Guarded Last 5 rollback

Main-site baseline: `ball46-production` version `02108724-ac78-4575-a98a-f7ee40053814`, deployment `6cbec888-e950-4cab-a26d-e36112083fe8`. This includes the latest Vote Reconnect V9, compact PC sidebar and 12 jerseys. Do not restore the older 246319a6 or V8/V6 source.

Owned Last 5 candidate: `15607595-5930-4093-8e9e-e64c52d9f120`, tag `B46_FORM_LAST5_20261025`. Branch `codex/ball46-form-last5-20261025`; workflow `.github/workflows/ball46-form-last5-20261025.yml`.

Use phase `restore` only after confirming this owned candidate is still the active 100% version. Preserve exact module/config/domain/route evidence and refresh the authenticated route audit. The runner rejects a newer deployment. Restore the baseline main-site version and verify expected public bytes and APIs.

The isolated private cache `ball46-form-history-v1`, version `8a9b143d-bae7-4846-9fbc-a285f2ee3179`, has no public domain, workers.dev endpoint or preview. It may remain unused after a main-site restore; do not delete its namespace or any Vote/Engine data. The baseline main version does not use the added FORM_HISTORY_SERVICE binding. Original six bindings and all original service versions must remain intact.

Activation automatically attempts an ownership-checked restore if protected data/config/public validation fails while the owned candidate remains current. No Vote, Engine343, HUB, Full Market, Member, Signal or Settlement Worker is deployed by this rail.
