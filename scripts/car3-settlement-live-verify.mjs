const base = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(`${url} failed: HTTP ${response.status}`);
  }
  return payload;
}

async function reconcileLegacy() {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const before = await jsonFetch(`${base}/paper-trades?limit=5000&reconcile_check=${Date.now()}`);
    if (!before.ok) throw new Error('paper-trades returned ok=false');
    const legacy = (before.trades || []).filter(
      trade => trade.status === 'SETTLED' && !String(trade.note || '').includes('FULL_MATCH_AH_V1')
    );
    console.log(`Reconcile attempt ${attempt}: legacy settled rows=${legacy.length}`);
    if (legacy.length === 0) return before;

    const settled = await jsonFetch(`${base}/paper-settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    if (!settled.ok) throw new Error(`paper-settle returned ok=false: ${JSON.stringify(settled)}`);
    console.log('paper-settle:', JSON.stringify(settled));
    await sleep(10000);
  }
  throw new Error('Legacy settlement reconciliation did not drain within 10 attempts');
}

function splitHandicap(line) {
  const rounded = Math.round(Number(line) * 4) / 4;
  const quarterIndex = Math.round(Math.abs(rounded) * 4);
  if (quarterIndex % 2 === 1) {
    const lower = Math.floor(rounded * 2) / 2;
    return [lower, lower + 0.5];
  }
  return [rounded];
}

function expectedSettlement(goalDifference, line) {
  const outcomes = splitHandicap(line).map(part => {
    const adjusted = goalDifference + part;
    return adjusted > 0.00001 ? 'WIN' : adjusted < -0.00001 ? 'LOSS' : 'PUSH';
  });
  if (outcomes.every(value => value === 'WIN')) return 'FULL WIN';
  if (outcomes.every(value => value === 'LOSS')) return 'FULL LOSS';
  if (outcomes.includes('WIN') && outcomes.includes('PUSH')) return 'HALF WIN';
  if (outcomes.includes('LOSS') && outcomes.includes('PUSH')) return 'HALF LOSS';
  if (outcomes.every(value => value === 'PUSH')) return 'PUSH';
  return 'SPLIT';
}

async function auditLedger() {
  const data = await jsonFetch(`${base}/paper-trades?limit=5000&audit=${Date.now()}`);
  if (!data.ok) throw new Error('paper-trades audit returned ok=false');

  const legacy = (data.trades || []).filter(
    trade => trade.status === 'SETTLED' && !String(trade.note || '').includes('FULL_MATCH_AH_V1')
  );
  if (legacy.length) throw new Error(`${legacy.length} legacy SETTLED row(s) remain unreconciled`);

  const mismatches = [];
  let checked = 0;
  for (const trade of data.trades || []) {
    if (trade.status !== 'SETTLED') continue;
    if (trade.finalHomeScore == null || trade.finalAwayScore == null) continue;
    checked += 1;
    const expected = expectedSettlement(
      Number(trade.finalHomeScore) - Number(trade.finalAwayScore),
      Number(trade.ahLine)
    );
    if (expected !== trade.settlement) {
      mismatches.push({
        fixtureId: trade.fixtureId,
        selectedTeam: trade.selectedTeam,
        opponent: trade.opponent,
        selectedSide: trade.selectedSide,
        line: trade.ahLine,
        ft: `${trade.finalActualHomeScore}-${trade.finalActualAwayScore}`,
        expected,
        actual: trade.settlement
      });
    }
  }

  console.log('Ledger audit:', JSON.stringify({ summary: data.summary, checked, mismatches }, null, 2));
  if (mismatches.length) throw new Error(`Full-match settlement audit found ${mismatches.length} mismatch(es)`);

  const target = (data.trades || []).find(trade => {
    const names = `${trade.selectedTeam || ''} ${trade.opponent || ''} ${trade.actualHome || ''} ${trade.actualAway || ''}`;
    return /Lechia/i.test(names) && /omza|omża/i.test(names);
  });

  if (target) {
    const targetAudit = {
      fixtureId: target.fixtureId,
      selectedSide: target.selectedSide,
      entry: `${target.entryActualHomeScore}-${target.entryActualAwayScore}`,
      ft: `${target.finalActualHomeScore}-${target.finalActualAwayScore}`,
      line: target.ahLine,
      odds: target.ahOdds,
      settlement: target.settlement,
      result: target.result,
      profitUnits: target.profitUnits,
      note: target.note
    };
    console.log('Reported fixture audit:', JSON.stringify(targetAudit, null, 2));
    if (
      Number(target.finalActualHomeScore) === 6 &&
      Number(target.finalActualAwayScore) === 2 &&
      target.selectedSide === 'AWAY' &&
      Number(target.ahLine) > 0 &&
      target.settlement !== 'FULL LOSS'
    ) {
      throw new Error('Reported 6-2 AWAY handicap fixture is not FULL LOSS after fix');
    }
  } else {
    console.log('Reported Lechia/Lomza row not found by display name; global ledger audit passed.');
  }

  return data;
}

async function readHealth() {
  const health = await jsonFetch(`${base}/engine-health?wheel_check=${Date.now()}`);
  if (!health.ok) throw new Error('engine-health returned ok=false');
  return health;
}

async function verifyWheel() {
  const first = await readHealth();
  if (String(first?.control?.mode || '').toUpperCase() !== 'RUNNING') {
    throw new Error(`Engine 3 is not RUNNING: ${first?.control?.mode}`);
  }
  const before = Date.parse(first?.liveScan?.lastAttemptAt || '') || 0;
  console.log(`Engine 3 RUNNING; lastAttemptAt before=${first?.liveScan?.lastAttemptAt || 'null'}`);

  let latest = first;
  let advanced = false;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    await sleep(15000);
    latest = await readHealth();
    const after = Date.parse(latest?.liveScan?.lastAttemptAt || '') || 0;
    if (after > before) {
      advanced = true;
      break;
    }
  }

  const result = {
    advanced,
    state: latest.state,
    mode: latest.control?.mode,
    lastAttemptAt: latest.liveScan?.lastAttemptAt,
    lastSuccessfulScanAt: latest.liveScan?.lastSuccessfulScanAt,
    pending: latest.d1?.paper?.pending,
    watchdogAction: latest.watchdog?.currentAction
  };
  console.log('Wheel audit:', JSON.stringify(result, null, 2));
  if (!advanced) throw new Error('Engine 3 cron wheel did not advance lastAttemptAt within 150 seconds');
  return result;
}

await reconcileLegacy();
await auditLedger();
await verifyWheel();
console.log('CAR 3 full-match settlement live verification PASSED');
