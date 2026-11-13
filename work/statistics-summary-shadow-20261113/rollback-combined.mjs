import {readFile,writeFile} from 'node:fs/promises';
import {active,cf} from '../statistics-member-sidebar-test-20261112/release-ops.mjs';
const O='work/statistics-summary-shadow-20261113/qa/combined';let a;try{a=JSON.parse(await readFile(O+'/activation.json'))}catch{console.log('NO_ACTIVATION');process.exit(0)}
if(!a.activated){console.log('NO_TRAFFIC_CHANGED');process.exit(0)}
const now=await active();if(now.version===a.base){console.log('ALREADY_RESTORED');process.exit(0)}if(now.version!==a.candidate)throw Error('CONCURRENT_CHANGE_NO_ROLLBACK');
await cf('/workers/scripts/ball46-production/deployments',{strategy:'percentage',versions:[{version_id:a.base,percentage:100}],annotations:{'workers/message':'Restore immediate baseline after combined release post-activation browser failure'}});
const restored=await active();if(restored.version!==a.base)throw Error('ROLLBACK_NOT_VERIFIED');await writeFile(O+'/post-browser-rollback.json',JSON.stringify({ok:true,restored},null,2));console.log('RESTORED '+a.base);
