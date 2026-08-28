const ACCESS_HASH='1cc981355210634b60e5798eced35e7f441e9b8c8e6d4484b632986bcf31b1c2';
const STORAGE_KEY='match-scouts:v1';
const MAX_NAME=64;
const ALLOWED_ORIGINS=new Set([
  'https://www.nomadtips3.com',
  'https://nomadtips3.com',
  'https://mccareysupon-png.github.io',
  'https://nomadtips3-live-web-production-canary.mccarey-supon.workers.dev',
]);

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers},
  });
}

function normalizeName(value){
  return String(value||'').trim().replace(/\s+/g,' ').slice(0,MAX_NAME);
}

function validVersion(value){
  const number=Number(value);
  return Number.isInteger(number)&&number>0?number:null;
}

function validSequence(value){
  const number=Number(value);
  return Number.isInteger(number)&&number>0?number:null;
}

function cleanSnapshot(value){
  return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
}

function cleanCreatedAt(value){
  const text=String(value||'');
  return text&&!Number.isNaN(Date.parse(text))?new Date(text).toISOString():new Date().toISOString();
}

function scoutId(sequence){
  return `MS-${String(sequence).padStart(4,'0')}`;
}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value||''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function authorized(request){
  const key=request.headers.get('x-settings-key')||'';
  return Boolean(key)&&await sha256Hex(key)===ACCESS_HASH;
}

function originAllowed(request){
  const origin=request.headers.get('origin');
  return !origin||ALLOWED_ORIGINS.has(origin);
}

function corsHeaders(request){
  const origin=request.headers.get('origin');
  if(!origin||!ALLOWED_ORIGINS.has(origin))return {'vary':'Origin'};
  return {
    'access-control-allow-origin':origin,
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'content-type,x-settings-key',
    'access-control-max-age':'600',
    'vary':'Origin',
  };
}

function withCors(response,request){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(corsHeaders(request)))headers.set(key,value);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export class ScoutRegistry{
  constructor(state){
    this.state=state;
  }

  async read(){
    const stored=await this.state.storage.get(STORAGE_KEY);
    return Array.isArray(stored)
      ? stored.filter(item=>item&&validSequence(item.sequence)&&validVersion(item.configVersion))
        .sort((a,b)=>Number(a.sequence)-Number(b.sequence))
      : [];
  }

  async write(items){
    await this.state.storage.put(STORAGE_KEY,items);
  }

  async register(input={}){
    const name=normalizeName(input.name);
    const configVersion=validVersion(input.configVersion);
    if(!name||!configVersion)return {ok:false,error:'invalid_registration'};

    const items=await this.read();
    const existing=items.find(item=>Number(item.configVersion)===configVersion);
    if(existing)return {ok:true,item:existing,existing:true};

    const sequence=items.reduce((max,item)=>Math.max(max,Number(item.sequence)||0),0)+1;
    const item={
      scoutId:scoutId(sequence),
      sequence,
      name,
      configVersion,
      appliesFromCycle:Number.isFinite(Number(input.appliesFromCycle))?Number(input.appliesFromCycle):null,
      createdAt:cleanCreatedAt(input.createdAt),
      settingsSnapshot:cleanSnapshot(input.settingsSnapshot),
    };
    await this.write([...items,item]);
    return {ok:true,item,existing:false};
  }

  async migrate(input={}){
    const legacy=Array.isArray(input.items)?input.items.slice(0,100):[];
    const items=await this.read();
    const usedSequences=new Set(items.map(item=>Number(item.sequence)));
    let nextSequence=items.reduce((max,item)=>Math.max(max,Number(item.sequence)||0),0)+1;
    let added=0;

    for(const raw of legacy.sort((a,b)=>(Number(a?.sequence)||0)-(Number(b?.sequence)||0))){
      const name=normalizeName(raw?.name);
      const configVersion=validVersion(raw?.configVersion);
      if(!name||!configVersion)continue;
      if(items.some(item=>Number(item.configVersion)===configVersion))continue;

      let sequence=validSequence(raw?.sequence);
      if(!sequence||usedSequences.has(sequence)){
        while(usedSequences.has(nextSequence))nextSequence+=1;
        sequence=nextSequence;
        nextSequence+=1;
      }
      usedSequences.add(sequence);
      items.push({
        scoutId:scoutId(sequence),
        sequence,
        name,
        configVersion,
        appliesFromCycle:Number.isFinite(Number(raw?.appliesFromCycle))?Number(raw.appliesFromCycle):null,
        createdAt:cleanCreatedAt(raw?.createdAt),
        settingsSnapshot:cleanSnapshot(raw?.settingsSnapshot),
      });
      added+=1;
    }

    items.sort((a,b)=>Number(a.sequence)-Number(b.sequence));
    if(added)await this.write(items);
    return {ok:true,added,scouts:items};
  }

  async fetch(request){
    const url=new URL(request.url);

    if(request.method==='GET'&&url.pathname==='/scouts'){
      return json({ok:true,scouts:await this.read()});
    }

    if(request.method==='GET'&&url.pathname.startsWith('/scouts/config/')){
      const version=validVersion(url.pathname.split('/').pop());
      if(!version)return json({ok:false,error:'invalid_config_version'},400);
      const item=(await this.read()).find(scout=>Number(scout.configVersion)===version)||null;
      return json({ok:true,item});
    }

    if(request.method==='POST'&&url.pathname==='/scouts/register'){
      let body;
      try{body=await request.json();}catch{return json({ok:false,error:'invalid_json'},400);}
      const result=await this.register(body);
      return json(result,result.ok?200:400);
    }

    if(request.method==='POST'&&url.pathname==='/scouts/migrate'){
      let body;
      try{body=await request.json();}catch{return json({ok:false,error:'invalid_json'},400);}
      return json(await this.migrate(body));
    }

    return json({ok:false,error:'not_found'},404);
  }
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);

    if(request.method==='OPTIONS'){
      if(!originAllowed(request))return withCors(json({ok:false,error:'origin_not_allowed'},403),request);
      return new Response(null,{status:204,headers:corsHeaders(request)});
    }

    if(request.method==='GET'&&url.pathname==='/health'){
      return withCors(json({ok:true,service:'nomad341-match-scout-registry',version:1}),request);
    }

    if(!originAllowed(request))return withCors(json({ok:false,error:'origin_not_allowed'},403),request);

    if(request.method==='POST'&&!await authorized(request)){
      return withCors(json({ok:false,error:'unauthorized'},401),request);
    }

    if(!env?.REGISTRY)return withCors(json({ok:false,error:'registry_binding_unavailable'},503),request);
    const id=env.REGISTRY.idFromName('nomad341-global');
    const response=await env.REGISTRY.get(id).fetch(request);
    return withCors(response,request);
  },
};
