// GPT Business Chat: isolated manual owner control, TEST only.
import {FORMULAS} from './b46-adaptive-ou-patterns-v1-test.mjs';
const rows=(db,q,...a)=>Array.from(db.exec(q,...a));
export function initOwnerControl(db){
 db.exec("CREATE TABLE IF NOT EXISTS gptbc_ou_control_test(formula TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), revision INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
 db.exec("CREATE TABLE IF NOT EXISTS gptbc_ou_audit_test(id INTEGER PRIMARY KEY AUTOINCREMENT, formula TEXT NOT NULL, old_enabled INTEGER NOT NULL, new_enabled INTEGER NOT NULL, revision INTEGER NOT NULL, at INTEGER NOT NULL)");
 for(const f of FORMULAS) db.exec("INSERT OR IGNORE INTO gptbc_ou_control_test VALUES(?,1,0,0)",f);
}
export function listOwnerControl(db){
 initOwnerControl(db);
 return rows(db,"SELECT * FROM gptbc_ou_control_test ORDER BY formula").map(r=>({...r,enabled:r.enabled===1}));
}
export function setOwnerControl(db,input,now){
 if(!input||!FORMULAS.includes(input.formula)||typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.revision)||input.revision<0||!Number.isSafeInteger(now))return {status:400,error:'INVALID_INPUT'};
 initOwnerControl(db);
 let result;
 db.transaction(()=>{
  const r=rows(db,"SELECT * FROM gptbc_ou_control_test WHERE formula=?",input.formula)[0];
  if(r.revision!==input.revision){result={status:409,error:'REVISION_CONFLICT'};return;}
  const enabled=Number(input.enabled);
  if(r.enabled===enabled){result={status:200,formula:r.formula,enabled:input.enabled,revision:r.revision,changed:false};return;}
  const revision=r.revision+1;
  db.exec("UPDATE gptbc_ou_control_test SET enabled=?,revision=?,updated_at=? WHERE formula=?",enabled,revision,now,r.formula);
  db.exec("INSERT INTO gptbc_ou_audit_test(formula,old_enabled,new_enabled,revision,at) VALUES(?,?,?,?,?)",r.formula,r.enabled,enabled,revision,now);
  result={status:200,formula:r.formula,enabled:input.enabled,revision,changed:true};
 });
 return result;
}
export function ownerControlEnabled(db,formula){
 if(!FORMULAS.includes(formula))return false;
 try{return rows(db,"SELECT enabled FROM gptbc_ou_control_test WHERE formula=?",formula)[0]?.enabled===1;}catch{return false;}
}
export async function handleOwnerControl(req,db,{authorized=false,now=Math.floor(Date.now()/1000)}={}){
 const path=new URL(req.url).pathname;
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
 if(!authorized)return reply({error:'UNAUTHORIZED'},401);
 if(path==='/owner/api/formulas'&&req.method==='GET')return reply({mode:'TEST',issuanceIntegrated:false,formulas:listOwnerControl(db)});
 if(path==='/owner/api/audit'&&req.method==='GET'){
  initOwnerControl(db);
  return reply({audit:rows(db,"SELECT * FROM gptbc_ou_audit_test ORDER BY id DESC LIMIT 200")});
 }
 if(path==='/owner/api/formulas/state'&&req.method==='POST'){
  if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON_REQUIRED'},415);
  let input;try{const raw=await req.text();if(raw.length>2048)return reply({error:'TOO_LARGE'},413);input=JSON.parse(raw);}catch{return reply({error:'INVALID_JSON'},400);}
  const result=setOwnerControl(db,input,now);return reply(result,result.status);
 }
 return reply({error:'NOT_FOUND'},404);
}
