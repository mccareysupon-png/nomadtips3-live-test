import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
async function api(path){
 const r=await fetch(root+path,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
 const j=await r.json(); assert(r.ok&&j.success===true,`CF_ERROR:${r.status}`); return j.result;
}
const d=await api(`/scripts/${SCRIPT}/deployments?per_page=3`);
const vv=d.deployments?.[0]?.versions; assert(vv?.length===1,'ACTIVE_BAD');
const active=vv[0].version_id;
const ver=await api(`/workers/${SCRIPT}/versions/${active}?include=modules`);
console.log('ACTIVE_VERSION='+active);
const wanted=['favorites','favorite','win rate','p/l today','today','ah','1x2','corners','btts','cards','other','member center','member.ball46.com','member2.ball46.com','email','login','sign in','signin','magic link','otp','session','auth'];
for(const m of ver.modules||[]){
 const t=Buffer.from(m.content_base64||'','base64').toString('utf8');
 const low=t.toLowerCase();
 const found=wanted.filter(x=>low.includes(x));
 if(!found.length) continue;
 console.log('MODULE='+m.name);
 console.log('FOUND='+found.join(','));
 for(const x of found){
   let i=low.indexOf(x); if(i<0)continue;
   const s=t.slice(Math.max(0,i-500),Math.min(t.length,i+x.length+1200)).replace(/\s+/g,' ');
   console.log('SNIP['+x+']='+s);
 }
}
for(const url of [
 'https://member.ball46.com/',
 'https://member.ball46.com/member',
 'https://member.ball46.com/login',
 'https://member.ball46.com/api/auth/session',
 'https://member.ball46.com/api/member/session',
 'https://member.ball46.com/api/member'
]){
 try{
  const r=await fetch(url,{redirect:'manual',headers:{'user-agent':'BALL46-readonly-audit/1.0'},signal:AbortSignal.timeout(30000)});
  const body=await r.text();
  console.log('URL='+url);
  console.log('STATUS='+r.status);
  console.log('LOCATION='+(r.headers.get('location')||''));
  console.log('SET_COOKIE='+(r.headers.get('set-cookie')?'yes':'no'));
  console.log('TYPE='+(r.headers.get('content-type')||''));
  console.log('BODY='+body.slice(0,2500).replace(/\s+/g,' '));
 }catch(e){console.log('URLERR='+url+' '+e.message)}
}

console.log('--- AUTH_FOCUS ---');
for(const m of ver.modules||[]){
 const t=Buffer.from(m.content_base64||'','base64').toString('utf8');
 for(const needle of ['Ball46 Member Login','/api/member/session','/api/member/login','/api/member/logout','/member/login','memberLogin','membership','email']){
   let p=0,c=0;
   while(true){
    const i=t.indexOf(needle,p); if(i<0)break;
    const ctx=t.slice(Math.max(0,i-1200),Math.min(t.length,i+needle.length+3500)).replace(/\s+/g,' ');
    console.log('AUTH_MODULE='+m.name);
    console.log('AUTH_NEEDLE='+needle);
    console.log('AUTH_CTX='+ctx);
    p=i+needle.length; if(++c>=8)break;
   }
 }
}
