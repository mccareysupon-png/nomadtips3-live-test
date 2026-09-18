const base = process.env.CANARY_URL;
if (!base) throw new Error('CANARY_URL missing');

async function get(path) {
  const r = await fetch(base + path, { headers: { accept: 'application/json' } });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, ok: r.ok, j };
}

function validateSorted(j, label) {
  if (j?.ok !== true || Number(j.bookmakerCount) !== 19) throw new Error(`${label}: bad response ${JSON.stringify(j)}`);
  const offers = (j.offers || []).filter(x => Number(x.odds) > 0);
  if (offers.length) {
    const max = Math.max(...offers.map(x => Number(x.odds)));
    if (Math.abs(Number(offers[0].odds) - max) > 1e-9) throw new Error(`${label}: offers not sorted best-first`);
  }
  const valid = offers.filter(x => x.pass);
  if (valid.length) {
    const max = Math.max(...valid.map(x => Number(x.odds)));
    if (!j.best || Math.abs(Number(j.best.odds) - max) > 1e-9) throw new Error(`${label}: selected best is not maximum valid price`);
  } else if (j.best) {
    throw new Error(`${label}: best exists although no offer passes rule`);
  }
  return { offers, valid };
}

let chosen = null;
for (const sel of ['HOME', 'DRAW', 'AWAY']) {
  const { status, j } = await get(`/referee?market=ft_1x2&selection=${sel}`);
  if (status !== 200) throw new Error(`1X2 ${sel}: HTTP ${status} ${JSON.stringify(j)}`);
  const { valid } = validateSorted(j, `1X2/${sel}`);
  if (valid.length && !chosen) {
    chosen = j;
    console.log('BEST19_1X2_PASS', sel, j.fixtureId, j.best, 'offers', j.offerCount, j.fullMarket);
  } else if (!valid.length) {
    console.log('BEST19_1X2_RULE_REJECT_OK', sel, j.fixtureId, 'offers', j.offerCount);
  }
}
if (!chosen) throw new Error('No 1X2 selection passed existing price rule on sample fixture');

let sameLineChecks = 0;
for (const [market, selection] of [['ft_ah','HOME'],['ft_ah','AWAY'],['ft_over','OVER'],['ft_under','UNDER']]) {
  const { status, j } = await get(`/referee?market=${market}&selection=${selection}`);
  if (status === 409 && j?.error === 'BET365_REFERENCE_LINE_UNAVAILABLE') {
    console.log('BEST19_REFERENCE_LINE_SKIP', market, selection);
    continue;
  }
  if (status !== 200) throw new Error(`${market}/${selection}: HTTP ${status} ${JSON.stringify(j)}`);
  if (j.canonicalSource !== 'BET365_FULL_MARKET') throw new Error(`${market}/${selection}: wrong canonical source ${j.canonicalSource}`);
  const { offers, valid } = validateSorted(j, `${market}/${selection}`);
  for (const x of offers) {
    if (Math.abs(Number(x.providerLine) - Number(j.canonicalProviderLine)) > 0.001) {
      throw new Error(`${market}/${selection}: mixed provider lines ${x.providerLine} vs ${j.canonicalProviderLine}`);
    }
  }
  sameLineChecks += 1;
  console.log('BEST19_SAME_LINE_PASS', market, selection, 'fixture', j.fixtureId, 'canonical', j.canonicalProviderLine, 'best', j.best, 'offers', j.offerCount, 'valid', valid.length, j.fullMarket);
}
if (!sameLineChecks) throw new Error('No Bet365 AH/O-U Full Market reference line available on live board');
console.log('ENGINE343_BEST19_CANARY_PASS', '1X2fixture', chosen.fixtureId, 'sameLineChecks', sameLineChecks);
