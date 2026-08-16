import settlementWorker,{Car31State as SettlementCar31State} from './settlement-v2.js';
import {handleAnimationRequest} from './animation-v3-source.js';
import {enrichLiveResponseWithGoalooClock} from './goaloo-clock.js';

const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*'
};
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:JSON_HEADERS});
const textHex=buffer=>[...new Uint8Array(buffer)].map(v=>v.toString(16).padStart(2,'0')).join('');
async function sha256Hex(value){return textHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}

export class Car31State extends SettlementCar31State{
  async hydrateStoredOddsKey(){
    if(this.env.ODDS_API_KEY)return'ENV';
    const stored=await this.state.storage.get('oddsApiKey');
    if(!stored)return'NONE';
    this.env={...this.env,ODDS_API_KEY:String(stored)};
    return'DURABLE_OBJECT';
  }

  async scan(trigger='cron'){
    await this.hydrateStoredOddsKey();
    return super.scan(trigger);
  }

  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname.startsWith('/bootstrap/odds-api-key/')){
      const existing=await this.state.storage.get('oddsApiKey');
      if(existing)return json({ok:true,keyConfigured:true,alreadyConfigured:true,source:'DURABLE_OBJECT'});
      const key=String(url.searchParams.get('key')||'').trim();
      const proof=url.pathname.split('/').filter(Boolean).at(-1)||'';
      if(!/^[a-f0-9]{32,}$/i.test(key))return json({ok:false,error:'INVALID_KEY_FORMAT'},400);
      const expected=await sha256Hex(`car34-bootstrap:${key}`);
      if(proof!==expected)return json({ok:false,error:'INVALID_BOOTSTRAP_PROOF'},403);
      const storedAt=new Date().toISOString();
      await this.state.storage.put('oddsApiKey',key);
      await this.state.storage.put('oddsApiKeyStoredAt',storedAt);
      this.env={...this.env,ODDS_API_KEY:key};
      return json({ok:true,keyConfigured:true,alreadyConfigured:false,source:'DURABLE_OBJECT',storedAt});
    }
    if(request.method==='GET'&&url.pathname==='/debug/key-status'){
      const source=await this.hydrateStoredOddsKey();
      const storedAt=await this.state.storage.get('oddsApiKeyStoredAt')||null;
      return json({ok:true,keyConfigured:Boolean(this.env.ODDS_API_KEY),source,storedAt});
    }
    await this.hydrateStoredOddsKey();
    return super.fetch(request);
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if((request.method==='GET'||request.method==='OPTIONS')&&url.pathname==='/animation'){
      return handleAnimationRequest(request,env,settlementWorker);
    }
    if(request.method==='GET'&&url.pathname.startsWith('/bootstrap/odds-api-key/')){
      const id=env.CAR31_STATE.idFromName('car31-production');
      return env.CAR31_STATE.get(id).fetch(request);
    }
    if(request.method==='GET'&&url.pathname==='/debug/key-status'){
      const id=env.CAR31_STATE.idFromName('car31-production');
      return env.CAR31_STATE.get(id).fetch(request);
    }
    if(request.method==='GET'&&url.pathname==='/live'){
      const response=await settlementWorker.fetch(request,env,ctx);
      return enrichLiveResponseWithGoalooClock(response);
    }
    return settlementWorker.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){
    return settlementWorker.scheduled(event,env,ctx);
  }
};
