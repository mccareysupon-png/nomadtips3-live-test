import { copy, ENGLISH, locales } from './copy.mjs';

export const ORIGIN = 'https://www.ball46.com';
const BRAND_IMAGE = ORIGIN + '/favicon-192.png';
const SITE_ID = ORIGIN + '/#website';
const ORG_ID = ORIGIN + '/#organization';
const PAGE_PATH = {
  home: '/',
  statistics: '/index.html?view=statistics',
  methodology: '/methodology.html',
  signal: '/signal.html',
};
const LOCAL_PATH = { home: '', statistics: 'statistics/', methodology: 'methodology/' };
const MATCH = /^\/match\/([1-9][0-9]{0,19})\/?$/;
const LOCALE_PATH = /^\/([a-z][a-z0-9-]*)(?:\/(statistics|methodology))?\/?$/;
const MAP_SIZE = 40_000;
const MATCHES_PER_PAGE = 100;
const HTML_CONTENT = 'text/html; charset=utf-8';
const XML_CONTENT = 'application/xml; charset=utf-8';
const dateLabel = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC',
});

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = value => String(value).replace(/[&<>"']/g, char => entities[char]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/&/g, '\\u0026');
const absolute = path => ORIGIN + path;
const matchPath = fixture => '/match/' + fixture.id + '/';

function pagePath(locale, page) {
  return locale === ENGLISH ? PAGE_PATH[page] : '/' + locales[locale].prefix + '/' + LOCAL_PATH[page];
}

function alternates(page) {
  if (!Object.hasOwn(LOCAL_PATH, page)) return [];
  return [
    ...Object.keys(locales).map(locale => [locale, absolute(pagePath(locale, page))]),
    ['x-default', absolute(pagePath(ENGLISH, page))],
  ];
}

function dataFor(page, locale = ENGLISH, includeAlternates = true) {
  const { heading, description } = copy[locale][page];
  return {
    title: heading + ' | BALL46', heading, description, locale,
    url: absolute(pagePath(locale, page)),
    alternate: includeAlternates ? alternates(page) : [],
    schema: page === 'home' && locale === ENGLISH ? websiteSchema(description) : null,
  };
}

function websiteSchema(description) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': SITE_ID, url: absolute('/'), name: 'BALL46',
        description, inLanguage: ENGLISH, publisher: { '@id': ORG_ID } },
      { '@type': 'Organization', '@id': ORG_ID, url: absolute('/'), name: 'BALL46',
        logo: { '@type': 'ImageObject', url: BRAND_IMAGE } },
    ],
  };
}

function head(data) {
  const { locale, title, description, url, alternate = [], schema } = data;
  const meta = (name, content, key = 'name') => '<meta ' + key + '="' + name + '" content="' + escape(content) + '">';
  return [
    '<title>' + escape(title) + '</title>',
    meta('description', description),
    meta('robots', data.robots ?? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'),
    url && '<link rel="canonical" href="' + escape(url) + '">',
    ...alternate.map(([lang, href]) => '<link rel="alternate" hreflang="' + lang + '" href="' + escape(href) + '">'),
    meta('og:site_name', 'BALL46', 'property'),
    meta('og:type', 'website', 'property'),
    meta('og:locale', locales[locale].og, 'property'),
    meta('og:title', title, 'property'),
    meta('og:description', description, 'property'),
    url && meta('og:url', url, 'property'),
    meta('og:image', BRAND_IMAGE, 'property'),
    meta('og:image:alt', 'BALL46', 'property'),
    meta('twitter:card', 'summary'),
    meta('twitter:title', title),
    meta('twitter:description', description),
    meta('twitter:image', BRAND_IMAGE),
    meta('twitter:image:alt', 'BALL46'),
    schema && '<script type="application/ld+json">' + json(schema) + '</script>',
  ].filter(Boolean).join('\n');
}

const managedMeta = [
  'head > title', 'head > link[rel="canonical"]', 'head > link[rel="alternate"][hreflang]',
  'head > meta[name="description"]', 'head > meta[name="robots"]',
  'head > meta[property^="og:"]', 'head > meta[name^="twitter:"]',
  'head > meta[property^="twitter:"]',
  'head > script[type="application/ld+json"]',
].join(', ');

const guideCss = `<style id="b46-seo-guide-style">
.b46-seo-guide { padding: 16px; margin-block: 12px; border-radius: 10px; background: rgba(128, 150, 136, .09); color: inherit; }
.b46-seo-guide h2,.b46-seo-guide h3 { margin: .75em 0 .25em; }
.b46-seo-guide p { margin: .25em 0 .85em; line-height: 1.55; }
.b46-seo-guide summary { font-weight: 700; cursor: pointer; }
.b46-seo-links { display: flex; flex-wrap: wrap; gap: .45rem .85rem; margin: .65rem 0; }
.b46-seo-links a { color: inherit; text-decoration: underline; text-underline-offset: .16em; }
</style>`;

function languageLinks(page, locale) {
  return '<nav class="b46-seo-links" aria-label="Languages">' +
    Object.entries(locales).map(([code, config]) =>
      '<a hreflang="' + code + '" lang="' + code + '" href="' + escape(pagePath(code, page)) +
      '"' + (code === locale ? ' aria-current="page"' : '') + '>' + escape(config.label) + '</a>',
    ).join('') + '</nav>';
}

function sections(page, level) {
  return page.sections.map(([heading, body]) => '<h' + level + '>' + escape(heading) + '</h' + level +
    '><p>' + escape(body) + '</p>').join('');
}

function dashboardGuide(page) {
  const content = copy.en[page];
  return '<aside class="b46-seo-guide" data-b46-seo-guide="' + page + '">' +
    '<details><summary>' + escape(content.heading) + '</summary><h2>' +
    (page === 'statistics' ? 'Understanding BALL46 statistics' : 'Reading the live football dashboard') +
    '</h2>' + sections(content, 3) + '</details><nav class="b46-seo-links" aria-label="Football resources">' +
    '<a href="/matches/">Match previews &amp; results</a><a href="/index.html?view=statistics">Statistics</a>' +
    '<a href="/methodology.html">Methodology</a></nav>' + languageLinks(page, ENGLISH) + '</aside>';
}

function rewriteDashboard(response, data, page, dashboard, Rewriter) {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;

  const rewriter = new Rewriter()
    .on('html', { element: element => element.setAttribute('lang', ENGLISH) })
    .on(managedMeta, { element: element => element.remove() })
    .on('head', { element: element => element.append(head(data) + (dashboard || page === 'methodology' ? guideCss : ''), { html: true }) });

  if (dashboard) {
    rewriter.on('[data-workspace-panel="statistics"]', {
      element: element => element.append(dashboardGuide('statistics'), { html: true }),
    });
    rewriter.on('[data-workspace-panel="live"]', {
      element: element => element.append(dashboardGuide('home'), { html: true }),
    });
  }
  if (page === 'methodology') {
    rewriter.on('.hero h1', { element: element => element.setInnerContent(data.heading) });
    rewriter.on('.hero .hero-card > p', { element: element => element.setInnerContent(data.description) });
    rewriter.on('main .article .lead', { element: element => element.setInnerContent(
      'Read how a football signal moves from live match data to result verification. Use the statistics record to review settled results, entry odds and performance across markets.',
    ) });
    rewriter.on('main .article', { element: element => element.append(
      '<div class="b46-seo-links"><a href="/index.html?view=statistics">Review football signal statistics</a>' +
      '<a href="/matches/">Browse football matches</a></div>' + languageLinks('methodology', ENGLISH), { html: true },
    ) });
  }
  const headers = new Headers(response.headers);
  for (const name of ['content-length', 'etag', 'content-md5', 'digest']) headers.delete(name);
  return rewriter.transform(new Response(response.body, { status: response.status, headers }));
}

const editorialCss = `<style>
:root{color-scheme:dark;--bg:#0c1813;--surface:#13261d;--text:#edf6f0;--sub:#b2c9ba;--accent:#94edb4}
*{box-sizing:border-box}body{font:1rem/1.55 system-ui,sans-serif;background:var(--bg);color:var(--text);margin:0}
main,.page-nav{max-width:58rem;margin:auto;padding:1rem clamp(1rem,4vw,2rem)}
.page-nav{display:flex;flex-wrap:wrap;gap:.8rem 1.2rem;align-items:center}
.brand{color:var(--text);font-size:1.45rem;font-weight:850;text-decoration:none;letter-spacing:-.04em}
h1{font-size:clamp(1.65rem,4vw,2.6rem);line-height:1.18;margin:.2em 0 .4em;overflow-wrap:anywhere}
h2{line-height:1.25;font-size:1.14rem;margin:1.05em 0 .35em}
p{margin:.4em 0 1em;color:var(--sub)}a{color:var(--accent);text-underline-offset:.18em}
.surface{padding:clamp(1rem,4vw,2rem);background:var(--surface);border-radius:1rem}
.b46-seo-links{display:flex;flex-wrap:wrap;gap:.6rem 1rem;margin:1rem 0}
dt{font-size:.9em;color:var(--sub)}dd{margin:0 0 .65rem}ol{padding-inline-start:1.45rem}li{margin:.48rem 0}
</style>`;

function standalone(data, body, status = 200) {
  const html = '<!doctype html><html lang="' + data.locale + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link rel="icon" href="/favicon-192.png">' + head(data) + editorialCss + '</head>' +
    '<body><header class="page-nav"><a class="brand" href="/">BALL46</a></header><main>' +
    body + '</main></body></html>';
  return content(html, HTML_CONTENT, { status, age: status === 200 ? 180 : 30 });
}

function localizedPage(locale, page) {
  const data = dataFor(page, locale);
  const links = Object.keys(LOCAL_PATH).filter(key => key !== page).map(key =>
    '<a href="' + pagePath(locale, key) + '">' + escape(copy[locale][key].heading) + '</a>',
  ).join('');
  return standalone(data, '<article class="surface"><h1>' + escape(data.heading) + '</h1><p>' +
    escape(data.description) + '</p>' + sections(copy[locale][page], 2) +
    '<a href="' + escape(PAGE_PATH[page]) + '">' + escape(page === 'methodology' ?
      copy[locale].methodology.heading + ' (English)' : copy[locale].dashboard) + '</a></article>' +
    '<nav class="b46-seo-links">' + links + '</nav>' + languageLinks(page, locale));
}

function statedStatus(match, now) {
  if (match.status === 'finished') return 'Full time';
  if (match.status === 'live') return now - match.observedAt <= 900_000 ? 'In play' : 'Last reported in play';
  return now < match.start ? 'Scheduled' : 'Kick-off status awaiting an update';
}

function matchPage(match, now) {
  const heading = match.home + ' vs ' + match.away;
  const url = absolute(matchPath(match));
  const startDate = new Date(match.start).toISOString();
  const status = statedStatus(match, now);
  const start = dateLabel.format(match.start) + ' UTC';
  const finished = match.status === 'finished';
  const description = finished
    ? heading + ' finished ' + match.result.join('–') + ' in ' + match.league + '. See the result and kick-off time.'
    : 'Follow ' + heading + ' in ' + match.league + '. See the scheduled kick-off, fixture status and latest reported score when available.';
  const schema = {
    '@context': 'https://schema.org', '@type': 'SportsEvent', '@id': url + '#event', url,
    name: heading, description, startDate, sport: 'Association football',
    homeTeam: { '@type': 'SportsTeam', name: match.home },
    awayTeam: { '@type': 'SportsTeam', name: match.away },
  };
  if (match.status === 'scheduled' && match.start > now) schema.eventStatus = 'https://schema.org/EventScheduled';

  return standalone({ locale: ENGLISH, heading, title: heading + ' | ' + match.league + ' | BALL46',
    description, url, schema }, '<article class="surface"><h1>' + escape(heading) +
    '</h1><p>' + escape(description) + '</p><h2>Match details</h2><dl><dt>Competition</dt><dd>' +
    escape(match.league) + '</dd><dt>Kick-off</dt><dd><time datetime="' + startDate + '">' + escape(start) +
    '</time></dd><dt>Match status</dt><dd>' + status + '</dd>' +
    (match.result ? '<dt>' + (finished ? 'Final score' : 'Last reported score') +
      '</dt><dd>' + match.result.join('–') + '</dd>' : '') +
    '</dl><h2>Follow more football matches</h2><nav class="b46-seo-links">' +
    '<a href="/">Live scores and signals</a><a href="/matches/">Browse matches</a></nav></article>');
}

function directoryPath(page) {
  return '/matches/' + (page === 1 ? '' : '?page=' + page);
}

function matchDirectory(fixtures, now, page) {
  const title = 'Football Match Previews & Results';
  const description = 'Browse available football fixtures and results by team, competition and kick-off time on BALL46.';
  const pageCount = Math.ceil(fixtures.entries.length / MATCHES_PER_PAGE);
  if (page > pageCount) return unavailable(404);
  const rows = fixtures.directory.slice((page - 1) * MATCHES_PER_PAGE, page * MATCHES_PER_PAGE);
  const links = rows.map(match => '<li><a href="' + matchPath(match) + '">' +
    escape(match.home + ' vs ' + match.away) + '</a> · ' + escape(match.league) +
    ' · ' + statedStatus(match, now) + '</li>').join('');
  const pagination = '<nav class="b46-seo-links" aria-label="Match pages">' +
    (page > 1 ? '<a href="' + directoryPath(page - 1) + '">Previous</a>' : '') +
    (page < pageCount ? '<a href="' + directoryPath(page + 1) + '">Next</a>' : '') + '</nav>';
  const suffix = page === 1 ? '' : ' · Page ' + page;
  return standalone({ locale: ENGLISH, title: title + suffix + ' | BALL46',
    description: description + (page === 1 ? '' : ' Page ' + page + '.'), url: absolute(directoryPath(page)) },
    '<section class="surface"><h1>' + title + suffix + '</h1><p>' + description +
    '</p><h2>Available matches</h2><ol start="' + ((page - 1) * MATCHES_PER_PAGE + 1) +
    '">' + links + '</ol>' + pagination + '</section>');
}

function content(body, type, { status = 200, age = 300 } = {}) {
  return new Response(body, { status,
    headers: { 'content-type': type, 'cache-control': 'public, max-age=' + age },
  });
}

function unavailable(status) {
  const heading = status === 404 ? 'Match not found' : 'Match listing temporarily unavailable';
  const response = standalone({ locale: ENGLISH, title: heading + ' | BALL46',
    description: heading, robots: 'noindex' }, '<h1>' + heading +
    '</h1><p><a href="/">Open the BALL46 dashboard</a></p>', status);
  if (status === 503) {
    response.headers.set('cache-control', 'no-store');
    response.headers.set('retry-after', '300');
  }
  return response;
}

const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
const xmlNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function urlSet(urls) {
  return content(xmlHeader + '<urlset xmlns="' + xmlNamespace + '">\n' +
    urls.map(url => '<url><loc>' + escape(absolute(url)) + '</loc></url>').join('\n') +
    '\n</urlset>', XML_CONTENT);
}

function sitemap(path, fixtures) {
  if (path === '/sitemap-pages.xml') {
    return urlSet([
      ...Object.values(PAGE_PATH),
      ...Object.keys(locales).filter(locale => locale !== ENGLISH).flatMap(locale =>
        Object.keys(LOCAL_PATH).map(page => pagePath(locale, page))),
      ...(fixtures ? ['/matches/'] : []),
    ]);
  }
  const count = Math.ceil((fixtures?.entries.length ?? 0) / MAP_SIZE);
  if (path === '/sitemap.xml') {
    const paths = ['/sitemap-pages.xml', ...Array.from({ length: count }, (_, i) => '/sitemap-matches-' + (i + 1) + '.xml')];
    return content(xmlHeader + '<sitemapindex xmlns="' + xmlNamespace + '">\n' + paths.map(file =>
      '<sitemap><loc>' + escape(absolute(file)) + '</loc></sitemap>').join('\n') + '\n</sitemapindex>', XML_CONTENT);
  }
  const shard = Number(path.match(/^\/sitemap-matches-([1-9][0-9]*)\.xml$/)?.[1]);
  if (Number.isInteger(shard)) {
    if (!fixtures) return unavailable(503);
    if (shard > count) return unavailable(404);
    return urlSet(fixtures.entries.slice((shard - 1) * MAP_SIZE, shard * MAP_SIZE).map(matchPath));
  }
  return null;
}

function redirect(path) {
  return new Response(null, { status: 308, headers: { location: path } });
}

export function indexFixtures(index) {
  if (!index) return null;
  const upcoming = index.entries.filter(match => match.status !== 'finished').sort((a, b) => a.start - b.start);
  const recent = index.entries.filter(match => match.status === 'finished');
  return {
    entries: index.entries,
    byId: new Map(index.entries.map(match => [match.id, match])),
    directory: [...upcoming, ...recent],
  };
}

export async function frontendSeo(request, { upstream, fixtures, Rewriter, now = Date.now() }) {
  const { pathname: path, searchParams } = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'HEAD') return upstream(request);

  if (path === '/robots.txt') {
    return content('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /5usd-control.html\n' +
      'Disallow: /api-monitor.html\nDisallow: /detection-test.html\n\nSitemap: ' + absolute('/sitemap.xml') + '\n',
    'text/plain; charset=utf-8');
  }
  if (path.startsWith('/sitemap')) {
    const result = sitemap(path, fixtures);
    if (result) return result;
  }
  if (path === '/matches' || path === '/matches/') {
    const ordinal = searchParams.get('page');
    if (ordinal !== null && !/^[1-9][0-9]{0,5}$/.test(ordinal)) return unavailable(404);
    const page = Number(ordinal ?? 1);
    if (path === '/matches' || ordinal === '1') return redirect(directoryPath(page));
    return fixtures ? matchDirectory(fixtures, now, page) : unavailable(503);
  }
  if (path.startsWith('/match/')) {
    const id = path.match(MATCH)?.[1];
    if (!id) return unavailable(404);
    if (!fixtures) return unavailable(503);
    const match = fixtures.byId.get(id);
    if (!match) return unavailable(404);
    return path === matchPath(match) ? matchPage(match, now) : redirect(matchPath(match));
  }

  const localized = path.match(LOCALE_PATH);
  const locale = localized && Object.keys(locales).find(code => locales[code].prefix === localized[1]);
  if (locale) {
    const page = localized[2] ?? 'home';
    const canonicalPath = pagePath(locale, page);
    return path === canonicalPath ? localizedPage(locale, page) : redirect(canonicalPath);
  }

  const dashboard = path === '/' || path === '/index.html';
  const kind = dashboard ? searchParams.get('view') : '';
  const legacyStats = path === '/statistics.html';
  const page = dashboard ? (kind === 'statistics' || kind === 'signal' ? kind : 'home') :
    legacyStats ? 'statistics' : path === '/methodology.html' ? 'methodology' : path === '/signal.html' ? 'signal' : null;
  const headers = new Headers(request.headers);
  if (page) {
    headers.delete('if-none-match');
    headers.delete('if-modified-since');
  }
  const response = await upstream(page ? new Request(request, { headers }) : request);
  if (!page || request.method === 'HEAD') return response;

  return rewriteDashboard(response, dataFor(page, ENGLISH, !legacyStats), page, dashboard, Rewriter);
}
