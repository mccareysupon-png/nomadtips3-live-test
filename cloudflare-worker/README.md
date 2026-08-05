# NOMADTIPS3 TEST API — Cloudflare Worker

This Worker is the TEST backend for the GitHub Pages site.

## Cloudflare dashboard deployment

1. Open **Workers & Pages** and choose **Create application**.
2. Choose **Import a repository** and select `mccareysupon-png/nomadtips3-live-test`.
3. Set the project root directory to `cloudflare-worker`.
4. Set the deploy command to `npm run deploy` if Cloudflare does not detect it automatically.
5. Deploy the Worker.
6. Open Worker **Settings → Variables and Secrets → Add**.
7. Add a **Secret** named `API_FOOTBALL_KEY` and paste the API-FOOTBALL key as its value.
8. Deploy the new Worker version.

## Test endpoints

- `/health`
- `/status`
- `/fixture?id=FIXTURE_ID`
- `/fixtures?ids=ID1,ID2,ID3`

The API key must remain in Cloudflare Secrets and must never be committed to GitHub.
