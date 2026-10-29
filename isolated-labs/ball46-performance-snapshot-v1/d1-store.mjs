/*
 * Dedicated D1 store for the preview sidecar ONLY. Requires a NEW database:
 * never use or migrate BALL46 main / Member databases.
 * Atomic timestamp-and-revision guard prevents an older cron overwriting a newer snapshot.
 */
import {validateStoredRecord} from './snapshot-service.mjs';
const KEY_PATTERN=/^ball46:performance:v1:latest$/;
export function createD1SnapshotStore(db){
  if(!db||typeof db.prepare!=='function')throw Error('SNAPSHOT_DB_BINDING_MISSING');
  return {
    async read(key){
      if(!KEY_PATTERN.test(key))throw Error('SNAPSHOT_KEY_NOT_ALLOWED');
      const value=await db.prepare('SELECT payload FROM performance_snapshot_v1 WHERE snapshot_key = ?1')
        .bind(key).first();
      if(!value)return null;
      let data;
      try{data=JSON.parse(value.payload)}catch{throw Error('SNAPSHOT_DB_JSON_INVALID')}
      validateStoredRecord(data);
      return data;
    },
    async putIfNewer(key,record){
      if(!KEY_PATTERN.test(key))throw Error('SNAPSHOT_KEY_NOT_ALLOWED');
      validateStoredRecord(record);
      const sql='INSERT INTO performance_snapshot_v1 '+
        '(snapshot_key, generated_at_ms, source_updated_at_ms, payload) '+
        'VALUES (?1, ?2, ?3, ?4) '+
        'ON CONFLICT(snapshot_key) DO UPDATE SET '+
        'generated_at_ms=excluded.generated_at_ms, '+
        'source_updated_at_ms=excluded.source_updated_at_ms, '+
        'payload=excluded.payload '+
        'WHERE excluded.generated_at_ms > performance_snapshot_v1.generated_at_ms '+
        'AND excluded.source_updated_at_ms >= performance_snapshot_v1.source_updated_at_ms';
      const result=await db.prepare(sql)
        .bind(key,record.generatedAtMs,record.source.ledgerUpdatedAt,JSON.stringify(record))
        .run();
      if(result?.success===false)throw Error('SNAPSHOT_D1_WRITE_FAILED');
      return Number(result?.meta?.changes??0)>0;
    }
  };
}
