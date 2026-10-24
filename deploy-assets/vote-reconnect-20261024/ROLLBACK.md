# Vote reconnect rollback

Baseline: `ball46-production` version `246319a6-203b-475f-afd6-95ed792b35be`, deployment `2de3db66-daf6-48f3-8941-70c07b029674`. This contains the latest PC sidebar spacing, V8 Vote card and12 jerseys.

Candidate: `02108724-ac78-4575-a98a-f7ee40053814`, ownership tag `B46_VOTE_RECONNECT_V9_20261024`. Branch `codex/ball46-vote-reconnect-20261024`; workflow `.github/workflows/ball46-vote-reconnect-20261024.yml`.

Only use phase `restore` after rechecking active version still equals this owned candidate, configuration matches the saved audit, and authenticated route evidence is fresh. The runner preserves all current modules/assets/bindings and checks public convergence after switching back to this baseline. It refuses a newer deployment. Never restore V8's older pre-sidebar baseline over the latest sidebar.

Vote data, signed identities, cookies, private vote backend, Durable Objects, namespaces, Engine343, HUB, Full Market, Signal and Statistics are retained. No rollback deletes votes or changes football services. Activation automatically attempts the same guarded restore if post-cutover verification fails while the owned candidate remains current.
