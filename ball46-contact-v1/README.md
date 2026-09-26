# Ball46 Contact Form v1

Isolated contact-form package. It is intentionally not wired into the football Worker or any current Production deployment workflow.

## Files
- `contact.html` — responsive contact page.
- `contact.css` — page-only styling.
- `contact.js` — client validation and POST to `/api/contact`.
- `contact-api-worker.js` — standalone Cloudflare Worker handler that sends via Resend.
- `wrangler.contact.example.toml` — preview-only example configuration.

## Delivery
- Destination: `jay@ball46.com`
- Default sender: `Ball46 Contact <contact@nomadtips3.com>`
- Resend sending domain `nomadtips3.com` must remain verified.
- `RESEND_API_KEY` must be configured as a Worker secret. Never place it in HTML, JS, Git, or a public variable.
- The visitor address is used as `reply_to`, so replying in Gmail goes back to the visitor.

## Safety / anti-spam
- Same-origin allow list for `ball46.com` and `www.ball46.com`.
- Honeypot field.
- Minimum form dwell time.
- Length/type validation server-side and client-side.
- User content is HTML-escaped before inclusion in email HTML.
- Resend API errors are not exposed to visitors.
- No football, odds, score, signal, statistics, settlement, or existing routing code is imported or modified.

## Safe rollout order
1. Preview `contact.html` visually on desktop and mobile.
2. Create a restricted Resend sending API key and store it as `RESEND_API_KEY` in the dedicated contact Worker only.
3. Deploy only the dedicated `ball46-contact-api` Worker to its workers.dev preview URL and send a test message.
4. Confirm the test message arrives in `jay@ball46.com` and Reply targets the visitor email.
5. Only after verification, add the dedicated route `ball46.com/api/contact*`.
6. Add `/contact` to the current Production footer/navigation by editing the exact live Production source, not a historical branch.

Do not use a whole-site `wrangler deploy` from this branch.
