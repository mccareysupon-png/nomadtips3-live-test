# ISOLATED STATISTICS QA ONLY

This branch contains ONLY a credential-free test bundle copied from local Statistics patch 20e83bc plus the runtime-test follow-up. It intentionally has no production source or deployment workflows.

NEVER MERGE THIS BRANCH INTO main OR DEPLOY IT. All Worker mutations are in an ephemeral Miniflare instance. Only public cached Website GETs are used to obtain fresh QA inputs. No Production secrets are supplied to the job.
