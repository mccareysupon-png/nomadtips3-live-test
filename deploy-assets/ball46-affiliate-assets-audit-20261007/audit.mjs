import {writeFileSync,mkdirSync} from 'node:fs';
import {inspect,publicFile,sha} from '../daily-performance-20261005/production.mjs';

mkdirSync('audit',{recursive:true});
const cur=await inspect();
const paths=[
  '/assets/affiliate/12bet-logo.png',
  '/assets/affiliate/easybet-logo.png',
  '/assets/affiliate/betsson-logo.png'
];
const assets=[];
for(const p of paths){
  try{
    const b=await publicFile(p,'image');
    assets.push({path:p,ok:true,bytes:b.length,sha:sha(b)});
  }catch(e){
    assets.push({path:p,ok:false,error:String(e.message||e)});
  }
}
const js=await publicFile('/full-market-bookmaker-343.js','javascript');
const s=js.toString('utf8');
const out={
  version:cur.restore.version,
  jsSha:sha(js),
  assets,
  mappings:{
    '12bet':s.includes("'12bet':'/assets/affiliate/12bet-logo.png'"),
    'easybets':s.includes("'easybets':'/assets/affiliate/easybet-logo.png'"),
    'betsson':s.includes("'betsson':'/assets/affiliate/betsson-logo.png'")
  }
};
writeFileSync('audit/report.json',JSON.stringify(out,null,2));
console.log('BALL46_AFFILIATE_ASSET_AUDIT',JSON.stringify(out));
