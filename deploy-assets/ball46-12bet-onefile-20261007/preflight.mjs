import {writeFileSync,mkdirSync} from 'node:fs';
import {inspect,publicFile,sha} from '../daily-performance-20261005/production.mjs';

mkdirSync('audit',{recursive:true});
const cur=await inspect();
const js=await publicFile('/full-market-bookmaker-343.js','javascript');
const css=await publicFile('/full-market-bookmaker-343.css','css');
let light=null,dark=null;
try{light=await publicFile('/assets/affiliate/12bet-logo.png','image')}catch{}
try{dark=await publicFile('/assets/affiliate/12bet-logo-dark.png','image')}catch{}
const sjs=js.toString('utf8'), scss=css.toString('utf8');
const sn=(s,n)=>{const i=s.toLowerCase().indexOf(n.toLowerCase());return i<0?null:s.slice(Math.max(0,i-900),Math.min(s.length,i+2400))};
const out={
 version:cur.restore.version,
 jsSha:sha(js), cssSha:sha(css),
 hasAff:sjs.includes("'12bet':'https://goto.elv520.com/join/49549/id/facebook/index.html'"),
 hasLogoMap:sjs.includes("'12bet':'/assets/affiliate/12bet-logo.png'"),
 light:light?{sha:sha(light),bytes:light.length}:null,
 dark:dark?{sha:sha(dark),bytes:dark.length}:null,
 css12bet:sn(scss,'data-b46-book-logo="12bet"'),
 index:null
};
try{
 const idx=await publicFile('/index.html','html');
 out.index={sha:sha(idx),snippet:sn(idx.toString('utf8'),'full-market-bookmaker-343.css')};
}catch{}
writeFileSync('audit/preflight.json',JSON.stringify(out,null,2));
console.log('BALL46_12BET_ONEFILE_PREFLIGHT',JSON.stringify(out));
