import core,{EngineState} from './index.js';
import {MatchScoutsState} from './match-scouts.js';

export {EngineState,MatchScoutsState};

const SETTINGS_KEY_SHA256='1cc981355210634b60e5798eced35e7f441e9b8c8e6d4484b632986bcf31b1c2';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const clone=value=>JSON.parse(JSON.stringify(value));

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function settingsAuthorized(request){
  const key=request.headers.get('x-settings-key')||'';
  return key.length>0&&await sha256Hex(key)===SETTINGS_KEY_SHA256;
}

function registryStub(env){
  const id=env.MATCH_SCOUTS.idFromName('primary');
  return env.MATCH_SCOUTS.get(id);
}

async function readActiveConfig(env){
  const response=await core.fetch(new Request('https://engine.local/config',{method:'GET'}),env);
  const data=await response.json();
  if(!response.ok||!data?.ok||!Number.isInteger(Number(data.version))) throw new Error(data?.error||`config_http_${response.status}`);
  return data;
}

async function publicRegistry(env){
  const response=await registryStub(env).fetch('https://match-scouts.local/');
  const registry=await response.json();
  if(!response.ok||!registry?.ok) return j({ok:false,error:registry?.error||'registry_unavailable'},response.status||503);
  try{
    const active=await readActiveConfig(env);
    return j({...registry,activeConfigVersion:Number(active.version)});
  }catch{
    return j({...registry,activeConfigVersion:null,coreStatus:'UNAVAILABLE'});
  }
}

async function registerScout(request,env){
  if(!await settingsAuthorized(request)) return j({ok:false,error:'unauthorized'},401);
  let body;
  try{body=await request.json();}catch{return j({ok:false,error:'invalid_json'},400);}
  const configVersion=Number(body?.configVersion);
  if(!Number.isInteger(configVersion)||configVersion<1) return j({ok:false,error:'config_version_invalid'},400);

  let active;
  try{active=await readActiveConfig(env);}catch(error){return j({ok:false,error:`core_config_unavailable:${String(error?.message||error)}`},503);}
  if(Number(active.version)!==configVersion){
    return j({ok:false,error:'config_version_not_active',activeConfigVersion:Number(active.version)},409);
  }

  const configSnapshot={
    schemaVersion:active.schemaVersion??null,
    version:Number(active.version),
    updatedAt:active.updatedAt??null,
    appliesFromCycle:active.appliesFromCycle??null,
    values:clone(active.activeConfig||active.config||{}),
  };
  const response=await registryStub(env).fetch(new Request('https://match-scouts.local/register',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({name:body?.name,configVersion,configSnapshot}),
  }));
  const result=await response.json();
  return j(result,response.status);
}

async function setDetached(request,env,detached){
  if(!await settingsAuthorized(request)) return j({ok:false,error:'unauthorized'},401);
  const action=detached?'detach':'attach';
  const response=await registryStub(env).fetch(new Request(`https://match-scouts.local/${action}`,{method:'POST'}));
  const result=await response.json();
  return j(result,response.status);
}

async function sidecarFetch(request,env){
  const url=new URL(request.url);
  if(request.method==='OPTIONS'){
    return new Response(null,{status:204,headers:{
      'access-control-allow-origin':'*',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'content-type,x-settings-key',
      'access-control-max-age':'86400',
    }});
  }
  if(url.pathname==='/match-scouts'&&request.method==='GET') return publicRegistry(env);
  if(url.pathname==='/match-scouts/register'&&request.method==='POST') return registerScout(request,env);
  if(url.pathname==='/match-scouts/detach'&&request.method==='POST') return setDetached(request,env,true);
  if(url.pathname==='/match-scouts/attach'&&request.method==='POST') return setDetached(request,env,false);
  return core.fetch(request,env);
}

export default {
  fetch:sidecarFetch,
  async scheduled(event,env,context){return core.scheduled(event,env,context);},
};
