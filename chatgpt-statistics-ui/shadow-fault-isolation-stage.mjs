// STAGING ONLY. The original legacy commit is unchanged. Shadow operations run after it.
// Recovery requires a real durable contiguous settlement journal from the legacy source.
// Source timestamps/IDs must not be fabricated into a sequence. Memory/log is diagnostic only.
// This prototype has no real Engine adapter, storage bindings or deployment.
export function safeReport(log,error,event){try{log("[SHADOW_DROP_RECOVERY]",{event,error:String(error?.message??error)})}catch{}}

export function runIsolatedShadowPipeline(event,{enqueue,deliver,waitUntil,log=()=>{}}){
 const task=Promise.resolve().then(async()=>{await enqueue(event);await deliver(event)}).catch(e=>safeReport(log,e,event));
 try{if(typeof waitUntil==="function")waitUntil(task)}catch(e){safeReport(log,e,event)}
 return task;
}

export async function commitWithShadow(commitLegacy,signalData,shadow){
 const result=await commitLegacy(signalData);
 try{runIsolatedShadowPipeline(result,shadow)}catch(e){safeReport(shadow?.log??(()=>{}),e,result)}
 return result;
}

export async function reconcile({readCommittedAfter,readCheckpoint,saveCheckpoint,postOnce},limit=100){
 let seq=await readCheckpoint();
 if(!Number.isSafeInteger(seq)||seq<0)throw Error("CHECKPOINT_REQUIRED");
 const events=await readCommittedAfter(seq,limit);
 if(!Array.isArray(events)||events.length>limit)throw Error("INVALID_COMMITTED_PAGE");
 for(const event of events){
  if(event.settled_seq!==seq+1)throw Error("SOURCE_SEQUENCE_GAP");
  await postOnce(event);
  await saveCheckpoint(event.settled_seq);
  seq=event.settled_seq;
 }
 return {processed:events.length,checkpoint:seq};
}

export async function selfTest(){
 const assert=(condition,name)=>{if(!condition)throw Error(name)};
 const results=[];const ledger=[],receipts=new Map(),queue=new Map(),tasks=[];let checkpoint=0,win=0,loss=0,push=0,mode="ok";const reports=[];
 const commit=async data=>{const event={signal_id:data.signal_id,result:data.result,settled_seq:ledger.length+1};ledger.push(event);return event};
 const postOnce=async e=>{if(mode==="receiver")throw Error("receiver offline");const prior=receipts.get(e.signal_id);if(prior){if(prior.settled_seq!==e.settled_seq||prior.result!==e.result)throw Error("conflict");return}receipts.set(e.signal_id,e);if(e.result==="WIN")win++;else if(e.result==="LOSS")loss++;else push++};
 const enqueue=async e=>{if(mode==="outbox")throw Error("outbox offline");queue.set(e.signal_id,e)};
 const deliver=async e=>{await postOnce(e);queue.delete(e.signal_id)};
 const shadow={enqueue,deliver,waitUntil:t=>tasks.push(t),log:(...x)=>reports.push(x)};
 const flush=async()=>{await Promise.all(tasks.splice(0))};
 const add=async (id,result)=>{let e=await commitWithShadow(commit,{signal_id:id,result},shadow);await flush();return e};
 const recovery={readCommittedAfter:async(seq,limit)=>{if(mode==="sequence")throw Error("source sequence unavailable");return ledger.filter(e=>e.settled_seq>seq).slice(0,limit)},readCheckpoint:async()=>checkpoint,saveCheckpoint:async seq=>{if(mode==="checkpoint")throw Error("checkpoint offline");checkpoint=seq},postOnce};
 await add("a","WIN");assert(ledger.length===1&&win===1,"normal");results.push("normal");
 mode="receiver";await add("b","LOSS");assert(ledger.length===2&&queue.has("b")&&loss===0,"receiver");results.push("receiver failure legacy survives");
 mode="ok";await deliver(queue.get("b"));assert(loss===1&&!queue.has("b"),"retry");results.push("retry");
 await postOnce(ledger[0]);assert(win===1&&receipts.size===2,"duplicate");results.push("duplicate");
 mode="outbox";await add("c","PUSH");assert(ledger.length===3&&!queue.has("c")&&reports.length>=1,"outbox");results.push("outbox failure legacy survives");
 mode="sequence";let rejected=false;try{await reconcile(recovery)}catch{rejected=true}assert(rejected&&ledger.length===3&&checkpoint===0,"sequence");results.push("sequence read failure legacy survives");
 mode="outbox";for(let i=0;i<4;i++)await add("missing"+i,i%2?"LOSS":"WIN");assert(ledger.length===7&&receipts.size===2,"five missed expected");
 mode="checkpoint";try{await reconcile(recovery)}catch{}assert(checkpoint===0,"checkpoint must not advance");
 mode="ok";await reconcile(recovery);assert(checkpoint===7&&receipts.size===7&&win===3&&loss===3&&push===1,"five recovered");
 await reconcile(recovery);assert(receipts.size===7,"recovery replay");results.push("queue offline five gaps recovered; checkpoint replay safe");
 return {passed:results.length,results,legacy:ledger.length,book:{win,loss,push},checkpoint};
}
