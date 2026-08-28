const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'access-control-allow-origin':'*',
  'cache-control':'no-store',
};

export const MATCH_SCOUTS_SCHEMA_VERSION=1;
export const MATCH_SCOUTS_STORAGE_KEY='matchScoutsRegistryV1';

const clone=value=>JSON.parse(JSON.stringify(value));
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const finitePositiveInteger=value=>Number.isInteger(Number(value))&&Number(value)>0;

export function emptyMatchScoutsRegistry(){
  return {
    schemaVersion:MATCH_SCOUTS_SCHEMA_VERSION,
    enabled:true,
    nextSequence:1,
    updatedAt:null,
    scouts:[],
  };
}

export function normalizeScoutName(value){
  const name=String(value??'').trim().replace(/\s+/g,' ');
  if(!name) return {ok:false,error:'scout_name_required'};
  if(name.length>80) return {ok:false,error:'scout_name_too_long'};
  return {ok:true,name};
}

export function normalizeMatchScoutsRegistry(value){
  if(!value||value.schemaVersion!==MATCH_SCOUTS_SCHEMA_VERSION) return emptyMatchScoutsRegistry();
  const scouts=Array.isArray(value.scouts)?value.scouts.filter(Boolean).map(clone):[];
  const highestSequence=scouts.reduce((highest,scout)=>Math.max(highest,Number(scout?.sequence)||0),0);
  return {
    schemaVersion:MATCH_SCOUTS_SCHEMA_VERSION,
    enabled:value.enabled!==false,
    nextSequence:Math.max(Number(value.nextSequence)||1,highestSequence+1),
    updatedAt:Number.isFinite(Number(value.updatedAt))?Number(value.updatedAt):null,
    scouts,
  };
}

export function registerMatchScout(registry,payload,createdAt=Date.now()){
  const current=normalizeMatchScoutsRegistry(registry);
  const nameResult=normalizeScoutName(payload?.name);
  if(!nameResult.ok) return {ok:false,error:nameResult.error,registry:current};
  if(!finitePositiveInteger(payload?.configVersion)) return {ok:false,error:'config_version_invalid',registry:current};
  const configVersion=Number(payload.configVersion);
  const existing=current.scouts.find(scout=>Number(scout?.configVersion)===configVersion);
  if(existing) return {ok:true,created:false,idempotent:true,scout:clone(existing),registry:current};

  const sequence=current.nextSequence;
  const scout={
    scoutId:`MS-${String(sequence).padStart(4,'0')}`,
    sequence,
    name:nameResult.name,
    configVersion,
    createdAt:Number(createdAt),
    configSnapshot:payload?.configSnapshot?clone(payload.configSnapshot):null,
  };
  const next={
    ...current,
    nextSequence:sequence+1,
    updatedAt:Number(createdAt),
    scouts:[...current.scouts,scout],
  };
  return {ok:true,created:true,idempotent:false,scout:clone(scout),registry:next};
}

export function setMatchScoutsEnabled(registry,enabled,updatedAt=Date.now()){
  const current=normalizeMatchScoutsRegistry(registry);
  return {...current,enabled:Boolean(enabled),updatedAt:Number(updatedAt)};
}

export function publicMatchScoutsRegistry(registry){
  const current=normalizeMatchScoutsRegistry(registry);
  return {
    ok:true,
    schemaVersion:current.schemaVersion,
    enabled:current.enabled,
    nextSequence:current.nextSequence,
    updatedAt:current.updatedAt==null?null:new Date(current.updatedAt).toISOString(),
    scouts:current.scouts.map(scout=>({
      scoutId:scout.scoutId,
      sequence:scout.sequence,
      name:scout.name,
      configVersion:scout.configVersion,
      createdAt:Number.isFinite(Number(scout.createdAt))?new Date(Number(scout.createdAt)).toISOString():null,
      configSnapshot:clone(scout.configSnapshot??null),
    })),
  };
}

export class MatchScoutsState {
  constructor(state,env){this.state=state;this.env=env;}

  async read(){
    return normalizeMatchScoutsRegistry(await this.state.storage.get(MATCH_SCOUTS_STORAGE_KEY));
  }

  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='GET') return j(publicMatchScoutsRegistry(await this.read()));
    if(request.method!=='POST') return j({ok:false,error:'method_not_allowed'},405);

    if(url.pathname==='/register'){
      let payload;
      try{payload=await request.json();}catch{return j({ok:false,error:'invalid_json'},400);}
      let result;
      await this.state.storage.transaction(async transaction=>{
        const current=normalizeMatchScoutsRegistry(await transaction.get(MATCH_SCOUTS_STORAGE_KEY));
        if(current.enabled===false){result={ok:false,error:'match_scouts_detached',registry:current};return;}
        result=registerMatchScout(current,payload,Date.now());
        if(result.ok&&result.created) await transaction.put(MATCH_SCOUTS_STORAGE_KEY,result.registry);
      });
      if(!result?.ok) return j({ok:false,error:result?.error||'registry_write_failed'},result?.error==='match_scouts_detached'?409:400);
      return j({ok:true,created:result.created,idempotent:result.idempotent,scout:result.scout});
    }

    if(url.pathname==='/detach'||url.pathname==='/attach'){
      const enabled=url.pathname==='/attach';
      let next;
      await this.state.storage.transaction(async transaction=>{
        const current=normalizeMatchScoutsRegistry(await transaction.get(MATCH_SCOUTS_STORAGE_KEY));
        next=setMatchScoutsEnabled(current,enabled,Date.now());
        await transaction.put(MATCH_SCOUTS_STORAGE_KEY,next);
      });
      return j(publicMatchScoutsRegistry(next));
    }

    return j({ok:false,error:'not_found'},404);
  }
}
