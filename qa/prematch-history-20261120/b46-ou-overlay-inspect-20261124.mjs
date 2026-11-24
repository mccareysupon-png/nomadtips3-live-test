import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account);
const prefix='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const read=async p=>{const r=await fetch(prefix+p,{headers:{authorization:'Bearer '+token}});const j=await r.json();assert(r.ok&&j.success);return j.result};
const worker='ball46-premium-match-colors-test-20261120';
const id=(await read('/scripts/'+worker+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const v=await read('/workers/'+worker+'/versions/'+id+'?include=modules');
const main=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString();
const cm=main.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);assert(cm);
const client=JSON.parse(cm[1]);
const needles=['b46AdaptivePanel(content)','function draw(','function renderEmptyOuScreen','const finish=()=>','content.append(','.b46pm-stats-board','.b46pm-list','b46pm-scroll-region'];
const selected=[];
for(const term of needles){
 for(const [file,src] of [['client',client],['main',main]]){
  const at=src.indexOf(term);
  if(at<0)continue;
  selected.push({term,file,index:at,text:src.slice(Math.max(0,at-1000),at+2400)});
 }
}
let css=[];
for(const pat of ['.b46pm-stats-board{','.b46pm-stats-board {','.b46pm-list{','.b46pm-stats-grid{','#b46pm-scroll-region','b46pm-stat{']){
 let idx=main.indexOf(pat);if(idx>=0)css.push({pat,at:idx,text:main.slice(Math.max(0,idx-150),idx+1200)});
}
const pos=client.indexOf('function draw('),end=client.indexOf('function renderEmptyOuScreen');
console.log('B46_UI_ORDER_FORENSIC '+JSON.stringify({id,mainBytes:main.length,clientBytes:client.length,selected,css,renderPositions:{pos,end}}).slice(0,27000));
