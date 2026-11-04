// Display-only overlay: no fixture, odds, event, signal or settlement creation.
export const DISPLAY_MAX_AGE_MS=90000;
export function displayStamp(x){const n=Number(x?.hubFetchedAt??x?.fetchedAt);return Number.isFinite(n)&&n>0?n:0}
export function validDisplaySnapshot(s,now=Date.now()){
 const t=displayStamp(s),live=Number(s?.liveFetchedAt??t);
 return s?.ok===true&&s.cacheOnly===true&&s.externalRequestsAdded===0&&s.stale!==true&&Array.isArray(s.fixtures)&&t>0&&t<=now+5000&&now-t<=DISPLAY_MAX_AGE_MS&&Number.isFinite(live)&&live>0&&now-live<=DISPLAY_MAX_AGE_MS;
}
export function projectLiveDisplay(rows,s,board,now=Date.now()){
 if(!validDisplaySnapshot(s,now)||displayStamp(board)>displayStamp(s))return rows;
 const byId=new Map(s.fixtures.map(f=>[String(f?.fixtureId??f?.id??''),f]));
 return rows.map(f=>{
 const next=byId.get(String(f?.fixtureId??f?.id??''));if(!next)return f;
 if(!['live','finished'].includes(f.boardState)&&next.boardState!=='live')return f;
 const out={...f};let changed=false;
 for(const k of ['minute','status','statusCode','statusReason','boardState']){
 if(!Object.hasOwn(next,k)||next[k]===null||next[k]===undefined)continue;
 if(k==='minute'&&(!Number.isFinite(Number(next[k]))||Number(next[k])<0))continue;
 if(k==='boardState'&&!['live','finished','unknown','scheduled'].includes(next[k]))continue;
 if(!Object.is(f[k],next[k])){out[k]=next[k];changed=true;}
 }
 if(next.goals&&typeof next.goals==='object'){
 const goals={...(f.goals||{})};let gc=false;
 for(const k of ['home','away','halfHome','halfAway']){const v=next.goals[k];if(v===null||v===undefined||!Number.isInteger(Number(v))||Number(v)<0)continue;if(goals[k]!==Number(v)){goals[k]=Number(v);gc=true;}}
 if(gc){out.goals=goals;changed=true;}
 }
 return changed?out:f;
 });
}


