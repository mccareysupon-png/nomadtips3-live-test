const market = (pick, confidence, outcome, extra = {}) => Object.freeze({
  pick,
  odds: null,
  oddsStatus: 'UNAVAILABLE',
  confidence,
  outcome,
  ...extra
});

const day6 = ({
  id, kickoffUtc, league, home, away, pick, odds, confidence,
  predictedScore, homeScore, awayScore, outcome,
  bttsPick, bttsOutcome, dcPick, dcOutcome,
  ahPick, ahOutcome, ahLine, ahSide
}) => Object.freeze({
  fixtureId: String(id),
  pickDate: '2026-08-04',
  league,
  home,
  away,
  kickoffUtc,
  pickLabel: pick,
  odds,
  bookmaker: 'Locked market',
  confidence,
  predictedScore,
  markets: {
    btts: market(bttsPick, 0, bttsOutcome),
    doubleChance: market(dcPick, 0, dcOutcome),
    asianHandicap: market(ahPick, 0, ahOutcome, {line: ahLine, side: ahSide})
  },
  reason: 'Archived NOMAD SYSTEM Day 6 record.',
  abcResult: 'ARCHIVED',
  source: 'NOMAD SYSTEM · DAY 6 ARCHIVE',
  status: 'RESULT_CONFIRMED',
  resultSource: 'API-FOOTBALL',
  resultConfirmed: true,
  outcome,
  homeScore,
  awayScore
});

export const HISTORICAL_RECORDS = Object.freeze([
  day6({id:1551656,kickoffUtc:'2026-08-04T02:00:00Z',league:'Costa Rica Liga Promerica',home:'Perez Zeledon',away:'CS Cartagines',pick:'CS Cartagines Win',odds:1.95,confidence:63,predictedScore:'0–2',homeScore:1,awayScore:0,outcome:'incorrect',bttsPick:'No',bttsOutcome:'correct',dcPick:'X2',dcOutcome:'incorrect',ahPick:'CS Cartagines -0.25',ahOutcome:'loss',ahLine:-0.25,ahSide:'away'}),
  day6({id:1610530,kickoffUtc:'2026-08-04T12:00:00Z',league:'Indonesia President Cup',home:'Persebaya Surabaya',away:'Arema FC',pick:'Persebaya Surabaya Win',odds:2.15,confidence:61,predictedScore:'2–1',homeScore:1,awayScore:0,outcome:'correct',bttsPick:'Yes',bttsOutcome:'incorrect',dcPick:'1X',dcOutcome:'correct',ahPick:'Persebaya Surabaya -0.25',ahOutcome:'win',ahLine:-0.25,ahSide:'home'}),
  day6({id:1610531,kickoffUtc:'2026-08-04T12:00:00Z',league:'Indonesia President Cup',home:'Persib Bandung',away:'Persija',pick:'Persib Bandung Win',odds:2.25,confidence:61,predictedScore:'1–0',homeScore:2,awayScore:1,outcome:'correct',bttsPick:'No',bttsOutcome:'incorrect',dcPick:'1X',dcOutcome:'correct',ahPick:'Persib Bandung -0.25',ahOutcome:'win',ahLine:-0.25,ahSide:'home'}),
  day6({id:1563636,kickoffUtc:'2026-08-04T15:30:00Z',league:'Russia Cup',home:'Dinamo Makhachkala',away:'Krylia Sovetov',pick:'Dinamo Makhachkala Win',odds:2.08,confidence:61,predictedScore:'2–0',homeScore:1,awayScore:2,outcome:'incorrect',bttsPick:'No',bttsOutcome:'incorrect',dcPick:'1X',dcOutcome:'incorrect',ahPick:'Dinamo Makhachkala -0.25',ahOutcome:'loss',ahLine:-0.25,ahSide:'home'}),
  day6({id:1557945,kickoffUtc:'2026-08-04T16:45:00Z',league:'Israel Toto Cup',home:'Ironi Kiryat Shmona',away:'Bnei Sakhnin',pick:'Ironi Kiryat Shmona Win',odds:1.95,confidence:66,predictedScore:'2–0',homeScore:1,awayScore:0,outcome:'correct',bttsPick:'No',bttsOutcome:'correct',dcPick:'1X',dcOutcome:'correct',ahPick:'Ironi Kiryat Shmona -0.50',ahOutcome:'win',ahLine:-0.5,ahSide:'home'}),
  day6({id:1607166,kickoffUtc:'2026-08-04T17:30:00Z',league:'Club Friendly',home:'Hapoel Beer Sheva',away:'FK Crvena Zvezda',pick:'FK Crvena Zvezda Win',odds:1.75,confidence:62,predictedScore:'1–2',homeScore:1,awayScore:0,outcome:'incorrect',bttsPick:'Yes',bttsOutcome:'incorrect',dcPick:'X2',dcOutcome:'incorrect',ahPick:'FK Crvena Zvezda -0.50',ahOutcome:'loss',ahLine:-0.5,ahSide:'away'}),
  day6({id:1576856,kickoffUtc:'2026-08-04T18:00:00Z',league:'Argentina Reserve League',home:'Godoy Cruz Res.',away:'Racing Club Res.',pick:'Racing Club Res. Win',odds:2.30,confidence:58,predictedScore:'1–2',homeScore:1,awayScore:1,outcome:'incorrect',bttsPick:'Yes',bttsOutcome:'correct',dcPick:'X2',dcOutcome:'correct',ahPick:'Racing Club Res. -0.25',ahOutcome:'half-loss',ahLine:-0.25,ahSide:'away'}),
  day6({id:1576857,kickoffUtc:'2026-08-04T18:00:00Z',league:'Argentina Reserve League',home:'Gimnasia Mendoza 2',away:'River Plate Res.',pick:'River Plate Res. Win',odds:1.91,confidence:59,predictedScore:'0–1',homeScore:1,awayScore:2,outcome:'correct',bttsPick:'No',bttsOutcome:'incorrect',dcPick:'X2',dcOutcome:'correct',ahPick:'River Plate Res. -0.25',ahOutcome:'win',ahLine:-0.25,ahSide:'away'}),
  day6({id:1549709,kickoffUtc:'2026-08-04T21:10:00Z',league:'Colombia Primera A',home:'Llaneros',away:'Fortaleza FC',pick:'Llaneros Win',odds:2.10,confidence:61,predictedScore:'1–0',homeScore:3,awayScore:1,outcome:'correct',bttsPick:'No',bttsOutcome:'incorrect',dcPick:'1X',dcOutcome:'correct',ahPick:'Llaneros -0.25',ahOutcome:'win',ahLine:-0.25,ahSide:'home'}),
  day6({id:1545399,kickoffUtc:'2026-08-04T22:00:00Z',league:'Bolivia Primera Division',home:'Independiente Petrolero',away:'Aurora',pick:'Aurora Win',odds:2.45,confidence:60,predictedScore:'1–2',homeScore:1,awayScore:1,outcome:'incorrect',bttsPick:'Yes',bttsOutcome:'correct',dcPick:'X2',dcOutcome:'correct',ahPick:'Aurora 0.00',ahOutcome:'push',ahLine:0,ahSide:'away'}),
  day6({id:1530109,kickoffUtc:'2026-08-04T23:45:00Z',league:'Leagues Cup',home:'FC Cincinnati',away:'CF Pachuca',pick:'FC Cincinnati Win',odds:2.05,confidence:60,predictedScore:'3–2',homeScore:3,awayScore:1,outcome:'correct',bttsPick:'Yes',bttsOutcome:'correct',dcPick:'1X',dcOutcome:'correct',ahPick:'FC Cincinnati -0.25',ahOutcome:'win',ahLine:-0.25,ahSide:'home'})
]);
