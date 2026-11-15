// Generate the exact D1 migration SQL. Run `node scripts/schema.mjs > schema.sql`.
const expressions = {
  win: "state IN ('WIN','HALF_WIN')", loss: "state IN ('LOSS','HALF_LOSS')",
  push: "state = 'PUSH'", pending: "state = 'PENDING'",
  half_win: "state = 'HALF_WIN'", half_loss: "state = 'HALF_LOSS'",
  odds_sum: 'COALESCE(odds,0)', odds_count: 'odds IS NOT NULL',
  profit_sum: 'COALESCE(profit,0)',
  profit_known: "state <> 'PENDING' AND profit IS NOT NULL",
  profit_missing: "state <> 'PENDING' AND profit IS NULL"
};
const cols = Object.keys(expressions);
const subst = (x, alias) => x.replace(/\b(state|odds|profit)\b/g, `${alias}.$1`);
const keys = [['NEW.day','NEW.market'],['NEW.day',"'__ALL__'"],["'__ALL__'",'NEW.market'],["'__ALL__'","'__ALL__'"]];
const add = () => keys.map(([day,market]) => `INSERT INTO stat_buckets(day,market,${cols.join(',')}) VALUES (${day},${market},${Object.values(expressions).map(x=>subst(x,'NEW')).join(',')}) ON CONFLICT(day,market) DO UPDATE SET ${cols.map(k=>`${k}=stat_buckets.${k}+excluded.${k}`).join(',')};`).join('\n');
const sub = () => `UPDATE stat_buckets SET ${Object.entries(expressions).map(([k,v])=>`${k}=${k}-(${subst(v,'OLD')})`).join(',')} WHERE (day,market) IN ((OLD.day,OLD.market),(OLD.day,'__ALL__'),('__ALL__',OLD.market),('__ALL__','__ALL__'));`;
console.log(`CREATE TABLE IF NOT EXISTS stat_rows (id TEXT PRIMARY KEY NOT NULL,day TEXT NOT NULL,market TEXT NOT NULL,state TEXT NOT NULL,odds REAL,profit REAL,fingerprint TEXT NOT NULL,raw_json TEXT NOT NULL,observed_at TEXT NOT NULL,CHECK(market <> '__ALL__'),CHECK(state IN ('WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH','PENDING')));\nCREATE TABLE IF NOT EXISTS stat_buckets (day TEXT NOT NULL,market TEXT NOT NULL,${cols.map(x=>`${x} ${x.includes('sum')?'REAL':'INTEGER'} NOT NULL DEFAULT 0`).join(',')},PRIMARY KEY(day,market));\nCREATE INDEX IF NOT EXISTS stat_rows_day ON stat_rows(day,market);\nCREATE TRIGGER IF NOT EXISTS stat_rows_ai AFTER INSERT ON stat_rows BEGIN\n${add()}\nEND;\nCREATE TRIGGER IF NOT EXISTS stat_rows_au AFTER UPDATE ON stat_rows BEGIN\n${sub()}\n${add()}\nEND;\nCREATE TRIGGER IF NOT EXISTS stat_rows_ad AFTER DELETE ON stat_rows BEGIN\n${sub()}\nEND;`);
