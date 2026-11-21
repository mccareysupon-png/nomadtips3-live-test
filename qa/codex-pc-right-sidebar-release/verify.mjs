import assert from 'node:assert/strict';

export class ReleaseHtmlPending extends Error {}

const rail = '.workspace.singlepage .live-stage-grid > .right-rail';

async function geometry(page) {
  return page.locator(rail).evaluate(rail => {
    const box = el => {
      const r = el.getBoundingClientRect(), c = getComputedStyle(el);
      return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom,
        radius: c.borderRadius, border: c.borderTopWidth, bg: c.backgroundColor,
        gradient: c.backgroundImage, shadow: c.boxShadow };
    };
    const cards = [...rail.querySelectorAll(':scope > .b46mp-card, :scope > [data-featured], :scope > .b46-match-monitor, :scope > [data-prediction-card], :scope > .b46-home-member-promo > a')]
      .map(box).filter(x => x.h).sort((a, b) => a.y - b.y);
    const banner = rail.querySelector('.b46mp-card');
    const photo = banner.querySelector('img');
    return {
      theme: document.documentElement.dataset.theme,
      cards, photo: photo.getAttribute('src'), photoLoaded: photo.complete && photo.naturalWidth > 0,
      filter: getComputedStyle(photo).filter, blend: getComputedStyle(banner, '::before').backgroundImage,
      href: banner.getAttribute('href'),
      names: [...rail.querySelectorAll('.feature-score [data-featured-home],.feature-score [data-featured-away]')].map(box),
      jersey: [...rail.querySelectorAll('.feature-score .pv8-feature-kit')].map(box),
      monitor: box(rail.querySelector('.b46-match-monitor')),
      vote: box(rail.querySelector('[data-prediction-card]')),
      promo: box(rail.querySelector('.b46-home-member-promo')),
    };
  });
}


export async function verifyUi({ chromium, devices }, origin, board, releaseTags, launchOptions = {}) {
  const fixtures = board.fixtures.filter(fixture => fixture?.fixtureId != null && fixture.home && fixture.away);
  const seed = fixtures.find(fixture => String(fixture.fixtureId) === '204784012') ?? fixtures[0];
  const second = fixtures.find(fixture => fixture.fixtureId !== seed?.fixtureId && fixture.boardState === 'live') ??
    fixtures.find(fixture => fixture.fixtureId !== seed?.fixtureId);
  assert(seed && second, 'Expected two distinct fixtures for browser QA');

  const homeId = String(seed.fixtureId);
  const secondId = String(second.fixtureId);
  const now = Date.now();
  const firstKickoff = new Date(now - 50 * 60000).toISOString();
  const secondKickoff = new Date(now - 45 * 60000).toISOString();
  const liveStatus = { boardState: 'live', status: 'live', statusCode: '2H', statusReason: '', minute: 64 };
  // Keep QA data and vote writes inside isolated browser contexts.
  const sample = [
    {
      ...seed, ...liveStatus, kickoffAt: firstKickoff, kickoffUtc: firstKickoff, providerOddsHeld: true,
      home: { ...seed.home, name: 'Muang Trang United' }, away: { ...seed.away, name: 'Yala FC' },
      goals: { home: 1, away: 0 }, statistics: { shotsOnTarget: { home: 6, away: 8 } },
      corners: { home: 2, away: 5 },
    },
    {
      ...second, ...liveStatus, kickoffAt: secondKickoff, kickoffUtc: secondKickoff,
      statistics: {}, corners: null, providerOddsHeld: false,
      providerOdds: { ...second.providerOdds, odds: { ...second.providerOdds?.odds,
        '1x2': { inplay: { home: 2, draw: 3.2, away: 3.9 } } } },
    },
  ];
  const signals = [{
    id: 'codex-right-qa', fixtureId: seed.fixtureId, market: 'Asian Handicap', selection: 'Away',
    line: 0, odds: 2.09, bookmaker: '1xBet', entryMinute: 55, entryScore: { home: 1, away: 0 },
    mirrorMinute: 64, mirrorScore: { home: 1, away: 0 }, createdAt: now,
  }];
  const scope = new URL(origin).hostname === 'www.ball46.com' ? 'production' : 'preview';
  const browser = await chromium.launch({ headless: true, ...launchOptions });

  async function test(theme, width, onlyMobile = false) {
    const page = await browser.newPage({
      ...(onlyMobile ? devices['iPhone 13'] : { viewport: { width, height: 1010 } }),
      ignoreHTTPSErrors: Boolean(launchOptions.executablePath), serviceWorkers: 'block',
    });
    let boardRows = sample;
    let votesReady = false;
    let saved = null;
    let firstVote;
    let readStarted = false;
    let replayed = 0;
    const waitForFailure = new Promise(resolve => { firstVote = resolve; });
    try {
      await page.addInitScript(theme => localStorage.setItem('nomad343_dashboard_theme_v1', theme), theme);
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin === origin) {
          if (url.pathname === '/api/engine/board') {
            const fixtures = boardRows.map(fixture => String(fixture.fixtureId) === secondId
              ? { ...fixture, providerOddsFreshAt: Date.now() } : fixture);
            return route.fulfill({ json: { ...board, fixtures } });
          }
          if (url.pathname === '/api/hub/snapshot') return route.fulfill({json:{}});
          if (url.pathname === '/api/engine/signals') return route.fulfill({json:{ok:true,signals,mirror:{}}});
          if (url.pathname === '/api/prediction-vote') {
            if (req.method() === 'POST') {
              saved = req.postDataJSON().choice;
              return route.fulfill({json:{ok:true,scope,fixtureId:homeId,total:24,counts:[12,7,5],myPick:saved,canVote:true}});
            }
            readStarted = true;
            if (!votesReady) {
              await waitForFailure;
              return route.fulfill({status:503,json:{ok:false}});
            }
            replayed++;
            return route.fulfill({json:{ok:true,scope,fixtureId:url.searchParams.get('fixtureId'),
              total:23,counts:[11,7,5],myPick:saved,canVote:true}});
          }
        }
        if (!['HEAD','GET'].includes(req.method())) return route.abort();
        return route.continue();
      });
      async function open(query) {
        const response = await page.goto(origin + '/index.html' + query, { waitUntil: 'domcontentloaded', timeout: 40000 });
        assert(response?.ok() && new URL(page.url()).origin === origin);
        const html = await response.text();
        if (!releaseTags.every(tag => html.includes(tag))) {
          throw new ReleaseHtmlPending('Browser received the previous Ball46 version');
        }
      }

      await open('?status=live');
      if (onlyMobile) {
        assert.equal(await page.locator(rail).isVisible(),false, 'Desktop rail should stay hidden on mobile');
        const color = await page.locator('html').getAttribute('data-theme');
        assert.equal(color,theme);
        console.log('Mobile retains its separate layout');
        return { theme, width, desktopRailVisible: false };
      }

      await page.locator(rail+' .featured-card[data-pv8-fixture="'+homeId+'"]').waitFor({timeout:25000});
      await page.locator(rail+' .feature-stats[data-codex-comparison="ready"]:visible').waitFor();
      await page.locator(rail+' .b46-match-monitor[data-state="awaiting"]:visible').waitFor();
      await page.locator(rail+' [data-codex-vote-state="waiting"]:visible').waitFor();
      await page.waitForFunction(()=>document.querySelector('.right-rail .b46mp-photo')?.naturalWidth>0);
      const ready = await geometry(page);
      assert(readStarted);
      assert.equal(ready.theme, theme);
      assert(ready.photoLoaded);
      assert.equal(ready.photo, '/b46-member-athlete-20261109.webp?v=1');
      assert.equal(ready.href, 'https://member.ball46.com/pricing');
      assert.equal(ready.filter, theme==='dark'?'brightness(0.88) contrast(1.05)':'none');
      if(theme==='dark')assert.match(ready.blend,/35%.*75%.*100%/);
      assert.equal(ready.names.length, 2);
      assert.equal(ready.jersey.length, 2);
      assert(Math.abs(ready.jersey[0].y-ready.jersey[1].y)<1);
      assert(ready.names[0].h>=40 && Math.abs(ready.names[0].h-ready.names[1].h)<1);
      assert(Math.abs(ready.names[0].y-ready.names[1].y)<1);
      assert(ready.monitor.h <= 44 && ready.vote.h <= 48, JSON.stringify([ready.monitor,ready.vote]));
      assert(ready.promo.y>ready.vote.y);
      assert(ready.cards.length===5);
      for(const [i,c] of ready.cards.entries()){
        assert.equal(c.radius,'14px');
        assert.equal(c.border, '0px');
        assert(c.gradient.startsWith('linear-gradient('), 'Card is missing its surface gradient');
        assert.notEqual(c.shadow, 'none', 'Card is missing its depth shadow');
        assert.equal(c.bg, theme==='dark'?'rgb(11, 25, 17)':'rgb(237, 245, 239)');
        assert.equal(c.w,ready.cards[0].w);
        if(i)assert(Math.abs(c.y-ready.cards[i-1].bottom-14)<1, 'Card spacing '+i);
      }

      firstVote();
      const confirm=page.locator(rail+' #pv8-confirm');
      await page.locator(rail+' [data-codex-vote-state="retry"]:visible').waitFor();
      assert.equal(await confirm.isEnabled(),true);
      const statusFits = await page.locator(rail+' .codex-vote-status').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
      assert(statusFits, 'The compact vote status should be readable without clipping');
      assert((await geometry(page)).vote.h<=48);
      votesReady = true;
      await confirm.click();
      await page.locator(rail+' .audience .vote-bars:visible').waitFor({timeout:15000});
      assert(replayed > 0);
      assert.equal(await page.locator(rail+' #pv8-total').textContent(),'23 votes');
      await page.locator(rail+' button[data-choice="1"]').click();
      await confirm.click();
      await page.waitForFunction(()=>document.querySelector('#pv8-total')?.textContent==='24 votes');
      assert.equal(saved,'1');

      await page.locator('.match-row[data-match-id="'+secondId+'"]').click();
      await page.locator(rail+' .featured-card[data-pv8-fixture="'+secondId+'"]').waitFor();
      await page.locator(rail+' .feature-stats[data-codex-comparison="empty"]').waitFor({state:'attached'});
      assert.equal(await page.locator(rail+' .feature-stats').isVisible(),false);
      await page.locator(rail+' .b46-match-monitor[data-state="live"] .mini-rings:visible').waitFor({timeout:15000});
      assert((await geometry(page)).monitor.h > 100);
      boardRows = sample.map(f => String(f.fixtureId) === secondId
        ? {...f, statistics:{shotsOnTarget:{home:0,away:0}}} : f);
      await page.evaluate(() => window.NOMAD343_DASHBOARD_V2.reload());
      await page.locator(rail+' .feature-stats[data-codex-comparison="ready"]:visible').waitFor();
      await page.locator('.match-row[data-match-id="'+homeId+'"]').click();
      await page.locator(rail+' .feature-stats[data-codex-comparison="ready"]:visible').waitFor();
      await open('?view=signal&signalMarket=cards');
      await page.waitForFunction(()=>document.body.dataset.workspaceView==='signal');
      const empty = page.locator(rail+' .feature-stats');
      await empty.locator('.feature-empty').waitFor({state:'attached'});
      assert.equal(await empty.isVisible(),false, 'Empty Signal comparison should stay hidden');
      const result = { theme, width, cardGap: 14, monitorHeight: ready.monitor.h, voteHeight: ready.vote.h,
        comparison: 'present, missing, zero, no selection', voting: 'waiting, retry, ready, submit' };
      console.log('Right sidebar verified', JSON.stringify(result));
      return result;
    } finally {
      firstVote();
      await page.close();
    }
  }

  try {
    return [await test('dark', 1536), await test('light', 1366), await test('dark', 390, true)];
  } finally {
    await browser.close();
  }
}
