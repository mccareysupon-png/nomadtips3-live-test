const ac=process.env.CLOUDFLARE_ACCOUNT_ID,tk=process.env.CLOUDFLARE_API_TOKEN; if(!ac||!tk)throw Error('Auth missing');
async function get(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ac+p,{headers:{Authorization:'Bearer '+tk}});const d=await r.json();if(!r.ok||!d.success)throw Error('GET FAILED '+p+' '+JSON.stringify(d.errors));return d.result;}
const d=await get('/workers/scripts/ball46-production/deployments?per_page=1'),id=d.deployments[0].versions[0].version_id;
const v=await get('/workers/workers/ball46-production/versions/'+id+'?include=modules');
const main=v.modules.find(x=>x.name===v.main_module),source=Buffer.from(main.content_base64,'base64').toString('utf8');
for(const needle of ['async function __b46DarkMatchCard20261020','function __b46DarkMatchCard20261020','MATCH_PATCH_ANCHOR_DRIFT','__b46NativeFeaturedMobile20261021','__b46ApprovedFeaturedV10','__b46StatsLeaguesNavV9']){
 const i=source.indexOf(needle);let lo=Math.max(0,i-1300),hi=Math.min(source.length,i+6800);
 console.log('B46_DARK_PATCH_SOURCE',JSON.stringify({needle,index:i,activeVersion:id,byteLength:source.length,sourceExcerpt:i>=0?source.slice(lo,hi):null}));
}
