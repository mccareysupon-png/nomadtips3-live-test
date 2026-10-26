// Fail-closed preflight for BALL46 Event Flow V2 candidate integration.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const CURRENT_VERIFIED='21c1519b-5874-412a-aea7-ebee2e057f46';
export function verifyBase({activeWorkerVersion,expectedWorkerVersion=CURRENT_VERIFIED,sourceSelectors,hasHideLast5,hasSidebarOutside,signalMinutes,preview=true}){
const failures=[];
if(!activeWorkerVersion || activeWorkerVersion!==expectedWorkerVersion)failures.push('ACTIVE_WORKER_VERSION_MISMATCH');
if(!sourceSelectors || !sourceSelectors.eventFlowRoot || !sourceSelectors.plotRoot || !sourceSelectors.signalCards || !sourceSelectors.eventIcons)failures.push('UNVERIFIED_EVENTFLOW_DOM');
if(hasHideLast5!==true)failures.push('LAST5_CONCEALMENT_NOT_PRESERVED');
if(hasSidebarOutside!==true)failures.push('LATEST_SIDEBAR_NOT_PRESERVED');
if(!Array.isArray(signalMinutes)||signalMinutes.some(n=>!Number.isFinite(n)||n<0||n>130))failures.push('SIGNAL_MINUTE_DATA_UNVERIFIED');
if(!preview)failures.push('PRODUCTION_ACTIVATION_NOT_ALLOWED_BY_THIS_CANDIDATE');
return {ok:failures.length===0,failures,referenceWorkerVersion:CURRENT_VERIFIED,mode:'PREVIEW_ONLY'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
const input=process.argv[2];if(!input){console.error('Usage: node guard.mjs evidence.json');process.exit(2)}
const result=verifyBase(JSON.parse(readFileSync(input,'utf8')));console.log(JSON.stringify(result,null,2));if(!result.ok)process.exit(1);
}
