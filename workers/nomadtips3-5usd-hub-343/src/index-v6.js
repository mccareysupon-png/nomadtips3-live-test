import baseWorker,{FiveUsdHub as BaseFiveUsdHub} from './index-v2.js';

const VIEW_VERSION='nomad343-hub-view-v6-engine-lean-rich-ui';
const RICH_VIEW_HEADER='x-nomad-snapshot-view';
const plain=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const key=v=>String(v?.id??v?.slug??v?.name??v?.bookmaker?.id??v?.bookmaker?.slug??v?.bookmaker?.name??'').toLowerCase().replace(/[\s_-]/g,'');

function engineProviderOdds(providerOdds){
  if(!plain(providerOdds))return providerOdds??null;
  const out={};
  if(providerOdds.odds!==undefined&&providerOdds.odds!==null)out.odds=providerOdds.odds;
  if(providerOdds.markets!==undefined&&providerOdds.markets!==null)out.markets=providerOdds.markets;
  if(providerOdds.bet365!==undefined&&providerOdds.bet365!==null)out.bet365=providerOdds.bet365;
  const rows=Array.isArray(providerOdds.bookmakers)?providerOdds.bookmakers:Array.isArray(providerOdds?.data?.bookmakers)?providerOdds.data.bookmakers:[];
  const bet=rows.find(row=>key(row).includes('bet365'));
  if(bet)out.bookmakers=[bet];
  return Object.keys(out).length?out:null;
}
function engineRow(row){
  if(!plain(row))return row;
  return {...row,providerOdds:engineProviderOdds(row.providerOdds),snapshotOddsView:'ENGINE_LEAN_BET365'};
}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function stub(env){return env.HUB.get(env.HUB.idFromName('global'))}

export class FiveUsdHub extends BaseFiveUsdHub{
  async snapshotView(mode='engine'){
    const full=await super.snapshot();
    if(!full?.ok)return full;
    if(mode==='rich')return {...full,viewVersion:VIEW_VERSION,snapshotMode:'RICH_UI_FULL'};
    return {...full,viewVersion:VIEW_VERSION,snapshotMode:'ENGINE_LEAN',fixtures:(full.fixtures||[]).map(engineRow)};
  }
  async fetch(request){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/snapshot'){
      const mode=String(request.headers.get(RICH_VIEW_HEADER)||'').toLowerCase()==='rich'?'rich':'engine';
      return json(await this.snapshotView(mode));
    }
    return super.fetch(request);
  }
}

export default{
  async fetch(request,env){
    const u=new URL(request.url);
    if(request.method==='GET'&&u.pathname==='/snapshot-rich'){
      const r=await stub(env).fetch(new Request('https://hub.internal/snapshot',{method:'GET',headers:{[RICH_VIEW_HEADER]:'rich'}}));
      return new Response(r.body,{status:r.status,headers:r.headers});
    }
    return baseWorker.fetch(request,env);
  },
  async scheduled(event,env,ctx){return baseWorker.scheduled(event,env,ctx)}
};
