async __b46LedgerWrite(operation){const prior=this.__b46LedgerWriteTail||Promise.resolve();const work=prior.catch(()=>{}).then(operation);this.__b46LedgerWriteTail=work.catch(()=>{});return work}
async __b46FilterArchived(rows){const list=Array.isArray(rows)?rows:[],id=B46_LEDGER_REPAIR_PLAN.duplicateId;if(!list.some(r=>String(r?.id)===id))return list;const alias=await this.ctx.storage.get('b46:ledger:duplicate-alias:v1:'+id);if(!alias?.active)return list;return list.filter(row=>{if(String(row?.id)!==id)return true;b46LedgerCheck(b46LedgerObservation(archivalSignal(row))===alias.observation,'ARCHIVED_ID_IDENTITY_CONFLICT');return false})}
async __b46NamedRepair(){return this.__b46LedgerWrite(async()=>{
 const p=B46_LEDGER_REPAIR_PLAN,journalKey='b46:ledger:repair:motagua:203745645:20261102:v1',aliasKey='b46:ledger:duplicate-alias:v1:'+p.duplicateId;
 if(p.mode==='restore')return this.__b46RestoreNamedRepair(journalKey,aliasKey);
 const prior=await this.ctx.storage.get(journalKey);if(prior)return{state:prior.state,operationId:prior.operationId};
 if(Date.now()>p.expiresAt)return{state:'EXPIRED_NO_CHANGE',operationId:p.operationId};
 try{return await this.ctx.storage.transaction(async txn=>{
  const existing=await txn.get(journalKey);if(existing)return{state:existing.state,operationId:existing.operationId};
  const canonicalKey=ledgerKey({id:p.canonicalId,createdAt:p.canonicalCreatedAt}),duplicateKey=ledgerKey({id:p.duplicateId,createdAt:p.duplicateCreatedAt});
  b46LedgerCheck(!journalKey.startsWith(STAT_LEDGER_PREFIX)&&!aliasKey.startsWith(STAT_LEDGER_PREFIX),'ARCHIVE_PREFIX');
  const canonical=await txn.get(canonicalKey),duplicate=await txn.get(duplicateKey),meta=normalizeLedgerMeta(await txn.get(STAT_LEDGER_META_KEY));
  b46LedgerCheck(canonical?.id===p.canonicalId&&duplicate?.id===p.duplicateId,'RECORD_ID');
  b46LedgerCheck(canonical.status==='SETTLED'&&canonical.result==='PUSH'&&canonical.settledAt===p.settledAt,'CANONICAL_SETTLEMENT');
  b46LedgerCheck(duplicate.status==='PENDING'&&(!duplicate.result||duplicate.result==='PENDING'),'DUPLICATE_STATUS');
  b46LedgerCheck(Number(canonical.createdAt)===p.canonicalCreatedAt&&Number(duplicate.createdAt)===p.duplicateCreatedAt&&Math.abs(canonical.createdAt-duplicate.createdAt)<=3000,'TIMESTAMPS');
  const observation=b46LedgerObservation(duplicate);b46LedgerCheck(observation===p.observation&&b46LedgerObservation(canonical)===observation,'OBSERVATION');
  b46LedgerCheck(meta.pending>=1&&meta.ledgerTotal>=2,'COUNTERS');
  const canonicalHash=await b46LedgerHash(canonical),duplicateHash=await b46LedgerHash(duplicate),metaBefore=structuredClone(meta),at=Date.now();
  applyLedgerMeta(meta,duplicate,-1);meta.updatedAt=at;
  b46LedgerCheck(meta.ledgerTotal===metaBefore.ledgerTotal-1&&meta.pending===metaBefore.pending-1,'COUNTER_DELTA');
  for(const key of['settledTotal','win','loss','push','halfWin','halfLoss','unresolved','byMarket'])b46LedgerCheck(b46LedgerString(meta[key])===b46LedgerString(metaBefore[key]),'PROTECTED_COUNTER_'+key);
  const journal={operationId:p.operationId,state:'APPLIED',archivedAt:at,reason:'EXACT_DUPLICATE_OBSERVATION',canonicalId:p.canonicalId,canonicalKey,canonicalHash,duplicateId:p.duplicateId,duplicateKey,duplicateHash,originalRow:structuredClone(duplicate),metaBefore,metaAfter:structuredClone(meta)};
  await txn.put(journalKey,journal);await txn.put(aliasKey,{active:true,operationId:p.operationId,canonicalId:p.canonicalId,observation});await txn.put(STAT_LEDGER_META_KEY,meta);
  b46LedgerCheck(await txn.delete(duplicateKey),'ARCHIVE_REMOVE_ACTIVE_KEY');
  b46LedgerCheck(await b46LedgerHash(await txn.get(canonicalKey))===canonicalHash,'CANONICAL_CHANGED');
  b46LedgerCheck(await b46LedgerHash((await txn.get(journalKey)).originalRow)===duplicateHash,'BACKUP_CHANGED');
  return{state:'APPLIED',operationId:p.operationId,canonicalId:p.canonicalId,duplicateId:p.duplicateId};
 })}catch(error){return{state:'PRECONDITION_FAILED_NO_CHANGE',operationId:p.operationId,error:String(error?.message||error)}}
})}
async __b46RestoreNamedRepair(journalKey,aliasKey){return this.ctx.storage.transaction(async txn=>{
 const journal=await txn.get(journalKey);if(!journal||journal.state==='RESTORED')return{state:journal?.state||'NOT_APPLIED'};
 b46LedgerCheck(journal.state==='APPLIED','RESTORE_STATE');
 const canonical=await txn.get(journal.canonicalKey);b46LedgerCheck(await b46LedgerHash(canonical)===journal.canonicalHash,'RESTORE_CANONICAL_CHANGED');
 b46LedgerCheck(!await txn.get(journal.duplicateKey),'RESTORE_ACTIVE_KEY_EXISTS');b46LedgerCheck(await b46LedgerHash(journal.originalRow)===journal.duplicateHash,'RESTORE_BACKUP_HASH');
 const meta=normalizeLedgerMeta(await txn.get(STAT_LEDGER_META_KEY));applyLedgerMeta(meta,journal.originalRow,1);meta.updatedAt=Date.now();
 await txn.put(journal.duplicateKey,journal.originalRow);await txn.put(STAT_LEDGER_META_KEY,meta);await txn.delete(aliasKey);await txn.put(journalKey,{...journal,state:'RESTORED',restoredAt:Date.now()});return{state:'RESTORED',operationId:journal.operationId}
})}
async __b46RepairStatus(){const j=await this.ctx.storage.get('b46:ledger:repair:motagua:203745645:20261102:v1');return j?{operationId:j.operationId,state:j.state,canonicalId:j.canonicalId,duplicateId:j.duplicateId,canonicalHash:j.canonicalHash,duplicateHash:j.duplicateHash,archivedAt:j.archivedAt,restoredAt:j.restoredAt,archiveRetained:!!j.originalRow,metaBefore:j.metaBefore,metaAfter:j.metaAfter}:{operationId:B46_LEDGER_REPAIR_PLAN.operationId,state:Date.now()>B46_LEDGER_REPAIR_PLAN.expiresAt?'EXPIRED_NO_CHANGE':'WAITING_FOR_EXISTING_SCAN'}}
