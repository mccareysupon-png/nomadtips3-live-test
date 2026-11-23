import fs from 'node:fs';
const stateFile='/tmp/b46-bot-fight-restore-state.json';
if(!fs.existsSync(stateFile)){console.log('B46_RESTORE_NO_STATE: original audit did not change bot mode');process.exit(0)}
const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
if(!state.changed||state.before!=='on'){console.log('B46_RESTORE_NO_CHANGE');process.exit(0)}
const url='https://api.cloudflare.com/client/v4/zones/'+state.zoneId+'/settings/bot_fight_mode';
const response=await fetch(url,{method:'PATCH',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({value:'on'}),signal:AbortSignal.timeout(20000)});
const json=await response.json();
if(!response.ok||!json.success||json.result?.value!=='on')throw new Error('CRITICAL_BOT_RESTORE_ERROR '+JSON.stringify(json.errors||[]));
fs.writeFileSync(stateFile,JSON.stringify({...state,changed:false}));
console.log('B46_BOT_FIGHT_MODE_RESTORED_BY_CLEANUP');
