/*
 * Preview-only configuration generator. NEVER accepts production worker name,
 * domain, route, existing D1 or cron from caller. Used for dry-run build
 * before an explicitly authorized remote isolated deployment.
 */
export const PREVIEW_WORKER = 'ball46-performance-snapshot-preview-only';
export const PREVIEW_DB = 'ball46-performance-snapshot-v1-preview-only';
export const PREVIEW_BINDING = 'SNAPSHOT_DB';
export const PREVIEW_CRON = '*/5 * * * *';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function makeRemoteConfig(databaseId){
  if(!UUID.test(databaseId||''))throw Error('PREVIEW_DATABASE_UUID_REQUIRED');
  const config={
    name:PREVIEW_WORKER,
    main:'./preview-worker.mjs',
    compatibility_date:'2026-05-22',
    workers_dev:true,
    preview_urls:false,
    d1_databases:[{binding:PREVIEW_BINDING,database_name:PREVIEW_DB,database_id:databaseId}],
    triggers:{crons:[PREVIEW_CRON]}
  };
  assertIsolatedPreviewConfig(config);
  return config;
}
export function assertIsolatedPreviewConfig(c){
  if(c?.name!==PREVIEW_WORKER||c.name==='ball46-production'
    ||c?.main!=='./preview-worker.mjs'
    ||c.workers_dev!==true||c.preview_urls!==false
    ||'routes' in c||'route' in c||'assets' in c
    ||'services' in c||'kv_namespaces' in c
    ||!Array.isArray(c.d1_databases)||c.d1_databases.length!==1
    ||c.d1_databases[0].binding!==PREVIEW_BINDING
    ||c.d1_databases[0].database_name!==PREVIEW_DB
    ||!UUID.test(c.d1_databases[0].database_id||'')
    ||JSON.stringify(c.triggers?.crons)!==JSON.stringify([PREVIEW_CRON]))
    throw Error('PREVIEW_ISOLATION_GUARD_FAILED');
  return true;
}
