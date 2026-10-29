# BALL46 Member Profile V2

One profile implementation serves every member through the existing Cloudflare Access identity and existing paid/owner entitlement check. No account or subscription is created by this feature.

## Routes

- `/member?view=profile`: protected profile page under the existing Access application.
- `/api/member/profile`: GET and PUT; both require existing ACTIVE member access.
- Existing member header opens the profile page and displays the saved name/photo.

## Persistence

`MEMBER_PROFILES` points to the dedicated `ball46-member-profiles-v2` D1 database. The key is derived on the server from the verified email. First-time reads do not write records. A member's first explicit save creates their profile. Email, plan, role and entitlement cannot be changed through the profile API.

The schema is additive and independent of Stripe and Signals. Writes use a version check to reject stale updates from other tabs. Avatar uploads are decoded and cropped in the browser to 512px WebP, then validated and saved with the profile.

Preferences persist to the profile. Language is a saved preference and date-format locale; the page's interface currently uses English. Time zone applies to profile date display. These settings do not alter the Signals renderer.

## Validation

Run `node --test --test-isolation=none ball46-member/profile-v2/profile-handler.test.mjs` from the repository root. The tests use isolated in-memory SQLite databases and sample identities.

Run `node ball46-member/profile-v2/browser-tests.mjs` with Playwright installed. The server binds only to 127.0.0.1 and uses sample identities and an in-memory database. `test-server.mjs` and browser test fixtures are never included in the deployed asset manifest.

## Deployment

The candidate workflow reconstructs the immutable live asset set, checks every available baseline asset, preserves all existing bindings and settings, and adds only the profile module, three profile assets, the member-page bridge tag and the D1 binding. Candidate creation does not change traffic when `PROFILE_PROMOTE` is false.

Promotion requires passing tests, the exact baseline Worker version/hash and unchanged routes, schedules and operational settings. Verification failure after promotion rolls traffic back only if the active version is still the version created by this run. A different deployment is never overwritten by rollback.

Baseline: `df432587-3741-4235-a6c5-000d8eacba4e`, runtime SHA256 `219534ac884da9eec5f9ddb43228a11a518a00d1e4acedaa41041f2d0f304f26`. Existing account/payment records are not migrated or edited. Rollback preserves newly saved profile records in D1.
