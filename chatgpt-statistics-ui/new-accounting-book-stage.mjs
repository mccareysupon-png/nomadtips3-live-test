// New accounting boundary. No legacy snapshot builder imports or history scans.
import {applyMarketTransition,marketSnapshot} from './market-accounting-stage.mjs';
import {marketGroup} from './market-groups-stage.mjs';
const normalize=r=>r?{...r,market:marketGroup(r.market)}:null;
export async function postNewBook(storage,event){
 if(!event?.committed||!event.id||!event.newRow?.id)throw Error('COMMITTED_EVENT_REQUIRED');
 return storage.transaction(async tx=>{
  const state=await tx.get('new-book:v1');
  if(!state?.book)throw Error('VERIFIED_OPENING_BALANCE_REQUIRED');
  const eventKey='new-book:event:'+String(event.id);
  if(await tx.get(eventKey))return {mode:'ALREADY_APPLIED',revision:state.revision};
  const next=applyMarketTransition(state.book,normalize(event.oldRow),normalize(event.newRow));
  if(next.mode.includes('REBUILD'))throw Error(next.mode);
  const revision=state.revision+1;
  await tx.put('new-book:v1',{book:next.state,revision});
  await tx.put(eventKey,true);
  return {mode:next.mode,revision};
 });
}
export async function readNewBook(storage){
 const state=await storage.get('new-book:v1');
 if(!state?.book)throw Error('VERIFIED_OPENING_BALANCE_REQUIRED');
 return {...marketSnapshot(state.book),revision:state.revision};
}
