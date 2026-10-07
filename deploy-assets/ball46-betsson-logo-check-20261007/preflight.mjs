import {writeFileSync,mkdirSync} from 'node:fs';
import {inspect,publicFile,sha} from '../daily-performance-20261005/production.mjs';

mkdirSync('audit',{recursive:true});
const cur=await inspect();
const out={version:cur.restore.version};

async function grab(path,type){
  try{
    const b=await publicFile(path,type);
    return {ok:true,bytes:b.length,sha:sha(b),text:type==='image'?null:b.toString('utf8')};
  }catch(e){return {ok:false,error:String(e.message||e)}}
}

out.js=await grab('/full-market-bookmaker-343.js','javascript');
out.css=await grab('/full-market-bookmaker-343.css','css');

const jsText=out.js.ok?out.js.text:'';
const cssText=out.css.ok?out.css.text:'';
const candidates=[];
for(const p of ['/assets/affiliate/betsson-logo.png','/assets/affiliate/betsson.png','/assets/affiliate/betsson-logo-dark.png']){
  candidates.push({path:p,...await grab(p,'image')});
}
out.candidates=candidates;

function snip(text,needle){
  const i=text.toLowerCase().indexOf(needle.toLowerCase());
  return i<0?null:text.slice(Math.max(0,i-1000),Math.min(text.length,i+2500));
}
out.jsBetsson=snip(jsText,'betsson');
out.cssLogo=snip(cssText,'.fmb-book-logo');
out.cssBetsson=snip(cssText,'betsson');
writeFileSync('audit/preflight.json',JSON.stringify(out,null,2));
console.log('BALL46_BETSSON_LOGO_PREFLIGHT',JSON.stringify({
  version:out.version,
  candidates:out.candidates.map(x=>({path:x.path,ok:x.ok,bytes:x.bytes,sha:x.sha,error:x.error})),
  hasBetssonJs:!!out.jsBetsson,
  hasBetssonCss:!!out.cssBetsson
}));
