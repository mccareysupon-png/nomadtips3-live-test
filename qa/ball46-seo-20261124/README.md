# BALL46 frontend SEO preview

Task B46-SEO-I18N-20261124 is a read-only preview on `test/ball46-frontend-seo-i18n-20261124`. The comparison base is the verified Default Odds V3 release commit `9360f1046`. Production release and Cloudflare configuration are outside this preview.

## Run the preview

In this directory, with Node 22 or later:

```sh
npm ci
npm test
npm run fixtures -- /tmp/ball46-seo-fixtures.json
npm run preview -- /tmp/ball46-seo-fixtures.json
```

Open `http://127.0.0.1:4176/`. For a workspace that sends HTTPS traffic through an environment proxy, run the fixture and preview commands with `NODE_USE_ENV_PROXY=1` on Node 24 or later. The preview sends a read-only GET to the existing public board every five minutes and swaps in the compact fixture index after a successful refresh. It preserves its last good read on failure. For a repeatable snapshot, provide a saved public board JSON as the second positional argument to the fixture and preview commands. This disables periodic refresh in preview.

Run browser verification with:

```sh
npx playwright install chromium
npm run test:browser -- /tmp/ball46-seo-fixtures.json /tmp/ball46-seo-qa.json
```

Set `B46_CHROMIUM` to an installed Chromium binary to use the system browser.

## Routes and content

| Route | Output |
| --- | --- |
| `/`, `/index.html?view=statistics`, `/methodology.html` | Distinct metadata and indexable English copy in the existing application markup |
| `/signal.html` | Live Signal metadata |
| `/<locale>/`, `/<locale>/statistics/`, `/<locale>/methodology/` | Localized reading pages for the 12 additional locale variants, with a link to the corresponding English dashboard or guide |
| `/matches/`, `/matches/?page=2` | Public links to all fixtures covered by the manifest |
| `/match/<fixture-id>/` | Team and league metadata, kick-off, reported result and SportsEvent JSON-LD |
| `/robots.txt`, `/sitemap.xml`, `/sitemap-pages.xml`, `/sitemap-matches-1.xml` | Proposed crawl rules, sitemap index and canonical URL lists |

Canonical URLs use `www.ball46.com` as declared by Production. The English Statistics URL uses the same route as the existing redirect from `/statistics.html`. English is the `x-default` for each topic. The localized reading pages are translated in full. The live dashboard and dynamic match details are English.

The match manifest contains public fixture fields only. It retains previously confirmed results for up to 30 days while current board data continues to refresh. It skips unconfirmed or incomplete fixtures and gives expired or unknown IDs a 404. The live score label reflects the freshness of the snapshot. The source provides no verified venue for the sampled fixtures, so the SportsEvent schema omits location. Eligibility for Google's event rich results requires additional fields.

`seo.mjs` accepts a standard Workers HTMLRewriter and an already loaded fixture index. The local adapter uses the same streaming handler contract and blocks indexing through the response header. Production publication would need the verified active Worker as its base and a way to deliver refreshed fixture manifests. The preview has no deployment workflow, writable upstream route or provider credentials.

## Verification

Browser QA checks the existing Odds Movement V3 and Sidebar Win Rate scripts by hash against the same Production HTML input. It exercises both themes in desktop Chromium and mobile Chromium emulation, verifies the English guide panels and localized server-rendered content, and checks match pages and discovery links from a public fixture snapshot. The suite checks runtime startup and script identity. A live odds change, real devices, production crawl behavior and traffic growth are outside this run.

Production release record: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/45306658585
