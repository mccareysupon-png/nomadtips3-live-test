const BASE='https://www.nowgoal.net';
const headers={
  'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  'accept':'text/html,application/javascript,text/javascript,*/*;q=0.8',
  'accept-language':'en-US,en;q=0.9','cache-control':'no-cache','pragma':'no-cache'
};
async function get(urlOrPath){
  const url=new URL(urlOrPath,BASE);url.searchParams.set('_nomad_roster',String(Date.now()));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const r=await fetch(url,{headers,redirect:'follow',signal:controller.signal});return {status:r.status,url:r.url,type:r.headers.get('content-type')||'',text:await r.text()};}
  finally{clearTimeout(timer);}
}
function compact(s){return String(s||'').replace(/\s+/g,' ').trim();}
function vars(text,names){
  const out={};
  for(const name of names){
    const re=new RegExp(`(?:var\\s+)?${name}\\s*=\\s*(["'])(.*?)\\1`,'i');
    const m=text.match(re);out[name]=m?m[2]:null;
  }
  return out;
}
function extractFunction(text,name){
  const start=text.indexOf(`function ${name}`);if(start<0)return null;
  const brace=text.indexOf('{',start);if(brace<0)return null;
  let depth=0,quote=null,escape=false;
  for(let i=brace;i<text.length;i++){
    const ch=text[i];
    if(quote){if(escape){escape=false;continue;}if(ch==='\\'){escape=true;continue;}if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return text.slice(start,i+1);
  }
  return text.slice(start,start+5000);
}

const home=await get('/');
console.log(`HOME status=${home.status} bytes=${home.text.length}`);
const found=vars(home.text,['_bfTxtByLeague','_bfTxtByTime','_bfTxt','_bfEvenDetail','_serverTime']);
console.log(`HOME_VARS ${JSON.stringify(found)}`);
for(const [name,path] of Object.entries(found)){
  if(!path||!/^\//.test(path)||!/_bfTxt|bf|data/i.test(name+path))continue;
  try{const r=await get(path);console.log(`ROSTER_FILE name=${name} path=${path} status=${r.status} type=${r.type} bytes=${r.text.length} sample=${compact(r.text).slice(0,20000)}`);}catch(e){console.log(`ROSTER_ERROR ${name} ${path} ${e?.message||e}`);}
}

const commonSrc=[...home.text.matchAll(/<script\b[^>]*src=["']([^"']*(?:common|setting)[^"']*)["']/gi)].map(m=>new URL(m[1],BASE).href);
for(const src of commonSrc){
  try{
    const js=await get(src);
    for(const name of ['Goal2GoalCn','Goal2Goal','Goal2CnOU']){
      const fn=extractFunction(js.text,name);if(fn)console.log(`FUNCTION ${name} FROM ${src} :: ${compact(fn)}`);
    }
    for(const term of ['_handicapTypeArray','_handicapGive','_handicapAccept']){
      const at=js.text.indexOf(term);if(at>=0)console.log(`TERM ${term} FROM ${src} :: ${compact(js.text.slice(Math.max(0,at-500),at+1400))}`);
    }
  }catch(e){console.log(`COMMON_ERROR ${src} ${e?.message||e}`);}
}

// Find inline source URLs even if the variable assignment is not a simple quoted literal.
for(const term of ['_bfTxtByLeague','_bfTxtByTime']){
  let at=0,count=0;
  while((at=home.text.indexOf(term,at))>=0&&count<10){
    console.log(`INLINE ${term} :: ${compact(home.text.slice(Math.max(0,at-600),at+1600))}`);at+=term.length;count++;
  }
}
