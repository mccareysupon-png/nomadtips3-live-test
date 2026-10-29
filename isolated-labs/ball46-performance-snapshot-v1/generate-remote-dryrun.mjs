import {writeFile,mkdir} from 'node:fs/promises';
import {makeRemoteConfig} from './remote-preview-config.mjs';
const folder='isolated-labs/ball46-performance-snapshot-v1';
const id='11111111-1111-4111-8111-111111111111'; // DRY RUN ONLY, never for remote
const conf=makeRemoteConfig(id);
await mkdir(folder,{recursive:true});
await writeFile(folder+'/wrangler.remote.generated.jsonc',JSON.stringify(conf,null,2)+'\n');
console.log('B46_REMOTE_PREVIEW_DRYRUN_CONFIG='+JSON.stringify({
 name:conf.name,databaseName:conf.d1_databases[0].database_name,workersDev:conf.workers_dev,
 routesPresent:Boolean(conf.route||conf.routes),cron:conf.triggers.crons[0],mode:'DRY_RUN_ONLY'}));
