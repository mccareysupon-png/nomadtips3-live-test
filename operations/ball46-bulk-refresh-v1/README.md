# BALL46 Bulk Live — preview only

A completely separate test prototype for 30/20/15-second refresh selection and a DEFAULT (30 seconds) button.

Run: `node --test operations/ball46-bulk-refresh-v1/core.test.mjs`

The preview contains no network requests, upstream API calls, or live connections. Its controls do not change any BALL46 server configuration.

Before any live integration, confirm the exact deployed 5USD control page and HUB revision. Implement owner authorization on the server, account-wide 5USD quota monitoring, Retry-After cooldown, persistent settings, isolated testing, and a versioned rollback. Do not alter unrelated modules or deploy without explicit approval.
