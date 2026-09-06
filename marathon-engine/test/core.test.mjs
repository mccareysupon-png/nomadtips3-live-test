import test from 'node:test';
import assert from 'node:assert/strict';
import {
  strictNumber,
  parseEventBlock,
  parseHandicapMarket,
  evaluateDetector,
  EngineStore,
  harvestStructuredJson
} from '../engine.mjs';

test('strictNumber preserves handicap sign exactly', () => {
  assert.equal(strictNumber('+1.0'), 1);
  assert.equal(strictNumber('-1.0'), -1);
  assert.equal(strictNumber('+0.75'), 0.75);
  assert.equal(strictNumber('-0.25'), -0.25);
  assert.equal(strictNumber('x1'), null);
});

test('parses verified Marathon live text without flipping home/away or signs', () => {
  const text = `Football. Russia. Premier League\nFakel — Akhmat Grozny 0:0 (0:0) 73:00\nMatch Result\nTo Win Match with Handicap\nTotal Goals\nFakel to Win 4.60 Draw 1.56 Akhmat Grozny to Win 5.05\nFakel (0) 1.82 Akhmat Grozny (0) 1.97 Under 0.5 1.70 Over 0.5 2.15`;
  const p = parseEventBlock(text, { sourceEventId: 'source-1' });
  assert.equal(p.status, 'PARSED');
  assert.equal(p.identity.home, 'Fakel');
  assert.equal(p.identity.away, 'Akhmat Grozny');
  assert.equal(p.live.score.home, 0);
  assert.equal(p.live.score.away, 0);
  assert.equal(p.live.clock.minute, 73);
  const ah = p.markets.find(x => x.type === 'HANDICAP');
  assert.equal(ah.home.line, 0);
  assert.equal(ah.home.odds, 1.82);
  assert.equal(ah.away.line, 0);
  assert.equal(ah.away.odds, 1.97);
});

test('keeps +1 on home and -1 on away exactly as source', () => {
  const text = `Football. UEFA Europa League\nAnderlecht — Hammarby 0:1 25:15\nTo Win Match with Handicap\nAnderlecht (+1.0) 1.56 Hammarby (-1.0) 2.25 Under 3.0 1.62 Over 3.0 2.15`;
  const p = parseEventBlock(text);
  const ah = p.markets.find(x => x.type === 'HANDICAP');
  assert.equal(ah.home.rawLine, '+1.0');
  assert.equal(ah.home.line, 1);
  assert.equal(ah.away.rawLine, '-1.0');
  assert.equal(ah.away.line, -1);
});

test('does not silently swap home and away', () => {
  const market = parseHandicapMarket('Alpha (+1.0) 1.90 Beta (-1.0) 1.90', 'Beta', 'Alpha');
  assert.equal(market, null);
});

test('unmapped block is explicit instead of guessed', () => {
  const p = parseEventBlock('Random live text without a team pair');
  assert.equal(p.status, 'SOURCE_UNMAPPED');
  assert.equal(p.reason, 'TEAM_PAIR_NOT_FOUND');
});

test('detector evaluates only explicit configured conditions', () => {
  const text = `Football. Test League\nHome FC — Away FC 1:0 72:15\nTo Win Match with Handicap\nHome FC (+1.0) 1.90 Away FC (-1.0) 1.90`;
  const p = parseEventBlock(text, { sourceEventId: 't-1' });
  const result = evaluateDetector(p, {
    enabled: true,
    minuteMin: 60,
    minuteMax: 89,
    minOdds: 1.10,
    maxOdds: null,
    ahMinLine: 1,
    ahMaxLine: null,
    sides: ['HOME', 'AWAY'],
    confirmScans: 1
  });
  assert.equal(result.decision, 'SIGNAL');
  assert.equal(result.candidates.find(x => x.selection === 'HOME').pass, true);
  assert.equal(result.candidates.find(x => x.selection === 'AWAY').pass, false);
});

test('market history updates odds on same identity without changing line identity', () => {
  const config = {
    maxRawItems: 100,
    maxHistoryPerMarket: 20,
    detector: { enabled: false, confirmScans: 1, sides: ['HOME','AWAY'], minuteMin:null, minuteMax:null, minOdds:null, maxOdds:null, ahMinLine:null, ahMaxLine:null }
  };
  const store = new EngineStore(config);
  store.upsert(parseEventBlock('Home — Away 0:0 70:00\nTo Win Match with Handicap\nHome (+1.0) 1.90 Away (-1.0) 1.90', { sourceEventId: '77' }));
  store.upsert(parseEventBlock('Home — Away 0:0 70:05\nTo Win Match with Handicap\nHome (+1.0) 1.95 Away (-1.0) 1.85', { sourceEventId: '77' }));
  const m = store.matches.get('marathon:77');
  assert.equal(m.marketHistory['HANDICAP|HOME|1'].length, 2);
  assert.equal(m.marketHistory['HANDICAP|HOME|1'][0].rawLine, '+1.0');
  assert.equal(m.marketHistory['HANDICAP|HOME|1'][1].rawLine, '+1.0');
});

test('unknown structured stats/events stay raw and candidate-only', () => {
  const config = { maxRawItems:100, maxHistoryPerMarket:20, detector:{ enabled:false, confirmScans:1, sides:['HOME','AWAY'] } };
  const store = new EngineStore(config);
  harvestStructuredJson(store, {
    event: { eventId: 9, homeTeam: 'A', awayTeam: 'B' },
    metrics: { possessionHome: 55, possessionAway: 45, dangerousAttacksHome: 10 }
  }, { url: 'test://source', transport: 'HTTP' });
  assert.ok(store.rawStructured.length >= 1);
  assert.ok(store.stats.length >= 1);
  assert.equal(store.rawStructured.some(x => x.sourceMeta.url === 'test://source'), true);
});
