import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {inspect,publicFile,sha} from '../daily-performance-20261005/production.mjs';

mkdirSync('audit',{recursive:true});
const cur=await inspect();
let logo={ok:false,status:null,sha:null,bytes:null,error:null};
try{
  const b=await publicFile('/assets/affiliate/easybet-logo.png','image');
  logo={ok:true,status:200,sha:sha(b),bytes:b.length,error:null};
}catch(e){logo.error=String(e.message||e)}
let js={ok:false,hasMap:false,hasAff:false,sha:null,error:null};
try{
  const b=await publicFile('/full-market-bookmaker-343.js','javascript');
  const s=b.toString('utf8');
  js={ok:true,hasMap:s.includes("'easybets':'/assets/affiliate/easybet-logo.png'"),hasAff:s.includes("'easybets':'https://track.matchbook-gaming.com/o/RjE8Gt?site_id=101060'"),sha:sha(b),error:null};
}catch(e){js.error=String(e.message||e)}
let css={ok:false,hasSize120:false,sha:null,error:null};
try{
  const b=await publicFile('/full-market-bookmaker-343.css','css');
  const s=b.toString('utf8');
  css={ok:true,hasSize120:s.includes('BALL46 EASYBET SIZE 120 20261007'),sha:sha(b),error:null};
}catch(e){css.error=String(e.message||e)}
const report={version:cur.restore.version,logo,js,css};
writeFileSync('audit/preflight.json',JSON.stringify(report,null,2));
console.log('BALL46_EASYBET_CROSSDEVICE_PREFLIGHT',JSON.stringify(report));
