# Fresh Lazy Full Market — TEST ONLY

Repository: mccareysupon-png/nomadtips3-live-test
Branch: test/ball46-fullmarket-fresh-20261111
Tested patch commit: 5158a82d75bcc9903a458435bad2d3c93e142558
Production base: 89063a40-8b5f-4c09-96c1-a19139f4c701; deployment 78fed90e-887d-4c03-8cc6-a49abc7e0175.
Production main SHA256: ad8b6a732f9f4494dc95adb364c396e1ac3af006d2897425179a80c7255e34ec.
Candidate main SHA256: dd1f27d495dc2df16ff041da6e05f737ebcbc792aecacc0cfba66cdd52098f45.

Current chat directory is not a Git checkout. PC inventory found eight repository directories (one unborn) plus one invalid .git directory. All staged/modified/untracked names and branch/HEAD values recorded in pc-inventory.json. Existing checkouts were not reset, pulled or switched. New GitHub test branch was created from the latest release evidence commit, then source was read directly from active Cloudflare modules. The old Lazy branch was not copied.

Only changes to deliver: Full Market browser update/chooseBook/renderBookHtml behavior inside the existing index.js asset transform. Existing inspect WeakMap cache and networkMode NONE remain. No new route, fetch, polling, Worker wrapper or module. Other 41 modules unchanged by construction. Each newly created Match Card host starts collapsed, no default bookmaker; click renders only that book, same click empties and hides the price panel, another click switches. Cached inspection reused. Reopening a new host does not inherit previous selection. Same open card retains chosen book through snapshot updates.

QA: 20 isolated real-source component checks PASS (Desktop1366:10; Mobile390:10), API click delta0, upstream requests0, cached inspection identity reused, reopen-collapsed PASS. Prices in these interaction tests are synthetic and explicitly labelled. Actual Production served script was captured via GET, then the original raw fixture was independently transformed through the actual active Worker function and matched byte-for-byte. Narrow inverse-diff and candidate-served-script equality PASS. Run https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/42921921355 .

Manual tests on local full current HTML with 1,098 recorded real fixtures showed PC Match Card opens, Full Market has no initial tables or selection. Mobile isolated open/collapse passed; full mobile Match Card integration is not fully verified. Event Flow end-to-end is BLOCKED: a read of current Production /api/engine/history returned B46_V13_CANDIDATE_ONLY_WORKER_EXCEPTION and Durable Object isolate exceeded its memory limit. Further history requests stopped. No Engine changes or fix claimed. Event Flow source bytes are untouched.

Not ready to claim full deployment readiness until Event Flow and full mobile integration pass. No Cloudflare write, deployment, traffic, security change or merge was performed in this task. Existing Bot Fight Mode state was not changed.

Rollback design: retain current active baseline and all modules; re-read Active/config before any future release; guard against concurrent changes. No rollback action needed because this task has no deployment.

