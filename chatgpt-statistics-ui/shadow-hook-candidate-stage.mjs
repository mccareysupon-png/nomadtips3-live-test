// STAGING candidate only. Applies to exact current production source in memory; never deploy here.
// Source has no verified durable commit sequence. This hook sends real row identities, not invented sequence IDs.
export function prepareHook(source){
 const start='async __b46UpsertLedgerUnlocked(sourceRows, fixtureMap = null) {';
 const end='async syncStatisticsLedger(finalFixture = null) {';
 if(source.split(start).length!==2||source.split(end).length!==2)throw Error('METHOD_DRIFT');
 const a=source.indexOf(start),b=source.indexOf(end,a);
 if(b<=a)throw Error('METHOD_ORDER');
 const method=source.slice(a,b);
 const change=[
 ['let inserted = 0, updated = 0, unchanged = 0;','let inserted = 0, updated = 0, unchanged = 0;\n    const __shadowCommitted = [];'],
 ['if (Object.keys(writes).length) await this.ctx.storage.put(writes);',`if (Object.keys(writes).length) await this.ctx.storage.put(writes);
      try {
        for(const [key,row] of Object.entries(writes)){
          const old=existing?.get?.(key);
          if(row?.status!=='SETTLED')continue;
          if(old?.status==='SETTLED'&&old.result===row.result&&old.odds===row.odds&&old.market===row.market&&old.settledAt===row.settledAt)continue;
          __shadowCommitted.push({signal_id: row.id,result:row.result,market_type:row.market,odds:row.odds,settled_at:row.settledAt,previous_result:old?.status==='SETTLED'?old.result:null,source_sequence:null});
        }
      } catch(e){try{console.error('[SHADOW_COLLECTION_FAILED]',String(e?.message||e))}catch{}}`],
 ['await this.ctx.storage.put(STAT_LEDGER_META_KEY, meta);',`await this.ctx.storage.put(STAT_LEDGER_META_KEY, meta);
    try {
      if(__shadowCommitted.length){
        const binding=this.env?.B46_SHADOW_RECEIVER;
        const task=Promise.resolve().then(async()=>{
          if(!binding)throw Error('SHADOW_BINDING_MISSING');
          const response=await binding.fetch('https://shadow.internal/settled',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events:__shadowCommitted})});
          if(!response.ok)throw Error('SHADOW_HTTP_'+response.status);
          const ack=await response.json();
          if(ack?.accepted!==__shadowCommitted.length)throw Error('SHADOW_ACK_MISMATCH');
        }).catch(e=>{try{console.error('[SHADOW_DROP_RECOVERY]',JSON.stringify({events:__shadowCommitted,error:String(e?.message||e)}))}catch{}});
        this.ctx.waitUntil(task);
      }
    }catch(e){try{console.error('[SHADOW_SCHEDULE_FAILED]',String(e?.message||e))}catch{}}`]
 ];
 let patched=method;for(const [old,next] of change){if(patched.split(old).length!==2)throw Error('ANCHOR_DRIFT:'+old.slice(0,55));patched=patched.replace(old,next)}
 let reversed=patched;for(const [old,next] of [...change].reverse())reversed=reversed.replace(next,old);
 if(reversed!==method)throw Error('LEGACY_METHOD_CHANGED');
 const full=source.slice(0,a)+patched+source.slice(b);
 return {source:full,originalMethod:method,patchedMethod:patched,legacyExact:true,outsideExact:full.slice(0,a)===source.slice(0,a)&&full.slice(a+patched.length)===source.slice(b)};
}
