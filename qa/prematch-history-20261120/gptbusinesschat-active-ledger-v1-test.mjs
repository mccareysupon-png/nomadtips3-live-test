import {initOwnerControl,ownerControlEnabled} from './gptbusinesschat-owner-control-v1-test.mjs';
export function initActiveLedger(db){
 initOwnerControl(db);
 db.exec("CREATE TABLE IF NOT EXISTS gptbc_ou_active_test(fixture_id INTEGER NOT NULL,formula_id TEXT NOT NULL,market TEXT NOT NULL,selection TEXT NOT NULL,issued_at INTEGER NOT NULL,PRIMARY KEY(fixture_id,formula_id,market,selection))");
}
// Called only inside the existing research insertion transaction, after a new row is accepted.
export function recordActiveIssuance(db,row,now){
 if(!ownerControlEnabled(db,row.formula))return false;
 db.exec("INSERT OR IGNORE INTO gptbc_ou_active_test VALUES(?,?,?,?,?)",row.fixtureId,row.formula,row.market,row.selection,now);
 return true;
}
// Settlement and verified revisions are inherited from the original immutable research key.
export function readActiveLedger(db,limit=500){
 initActiveLedger(db);
 return Array.from(db.exec("SELECT r.*,a.issued_at AS active_issued_at FROM gptbc_ou_active_test a JOIN b46_adaptive_ou_research_v1_ledger_test r USING(fixture_id,formula_id,market,selection) ORDER BY a.issued_at DESC,a.fixture_id,a.formula_id,a.selection LIMIT ?",Math.max(1,Math.min(500,Number(limit)||500))));
}
