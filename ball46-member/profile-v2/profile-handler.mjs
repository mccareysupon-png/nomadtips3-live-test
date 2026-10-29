const MAX_BODY_BYTES=300000;
const HEADERS={'cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...HEADERS,'content-type':'application/json; charset=utf-8'}});
export async function profileKey(email){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
}
export function validateProfile(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_PROFILE');
  const allowed=['version','displayName','avatar','locale','timeZone','reducedMotion'];
  if(Object.keys(input).some(key=>!allowed.includes(key))||allowed.some(key=>!(key in input)))throw Error('INVALID_FIELDS');
  if(!Number.isSafeInteger(input.version)||input.version<0)throw Error('INVALID_VERSION');
  if(typeof input.displayName!=='string')throw Error('INVALID_NAME');
  const displayName=input.displayName.trim().replace(/\s+/gu,' ');
  if(!displayName||Array.from(displayName).length>60||/[\p{Cc}\p{Cf}]/u.test(displayName))throw Error('INVALID_NAME');
  if(!['en','th'].includes(input.locale)||typeof input.reducedMotion!=='boolean')throw Error('INVALID_PREFERENCES');
  if(typeof input.timeZone!=='string'||input.timeZone.length>80)throw Error('INVALID_TIME_ZONE');
  try{new Intl.DateTimeFormat('en',{timeZone:input.timeZone}).format();}catch{throw Error('INVALID_TIME_ZONE');}
  if(input.avatar!==null){
    if(typeof input.avatar!=='string'||input.avatar.length>260000)throw Error('INVALID_AVATAR');
    const match=/^data:image\/(webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.avatar);
    if(!match||match[2].length%4!==0)throw Error('INVALID_AVATAR');
    let binary;try{binary=atob(match[2]);}catch{throw Error('INVALID_AVATAR');}
    const bytes=Array.from(binary,value=>value.charCodeAt(0));
    if(binary.length<30||binary.slice(0,4)!=='RIFF'||binary.slice(8,12)!=='WEBP')throw Error('INVALID_AVATAR');
    const kind=binary.slice(12,16);let width=0,height=0;
    if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=(bytes[26]|bytes[27]<<8)&16383;height=(bytes[28]|bytes[29]<<8)&16383;}
    if(kind==='VP8L'&&bytes[20]===47){width=1+(bytes[21]|(bytes[22]&63)<<8);height=1+((bytes[22]>>6)|bytes[23]<<2|(bytes[24]&15)<<10);}
    if(kind==='VP8X'){width=1+(bytes[24]|bytes[25]<<8|bytes[26]<<16);height=1+(bytes[27]|bytes[28]<<8|bytes[29]<<16);}
    if(width!==512||height!==512)throw Error('INVALID_AVATAR');
  }
  return {...input,displayName};
}
async function readBody(request){
  if(Number(request.headers.get('content-length'))>MAX_BODY_BYTES)throw Error('BODY_TOO_LARGE');
  const reader=request.body?.getReader();if(!reader)throw Error('INVALID_BODY');
  const chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BODY_BYTES){await reader.cancel();throw Error('BODY_TOO_LARGE');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('INVALID_JSON');}
}
const profileView=(record,identity,member)=>({
  email:identity.email,
  displayName:record?.display_name||member.displayName||'',
  avatar:record?.avatar||null,
  locale:record?.locale||'en',timeZone:record?.time_zone||'Asia/Bangkok',
  reducedMotion:Boolean(record?.reduced_motion),version:record?.version||0,
  updatedAt:record?.updated_at||null,
  membership:{plan:member.plan||'BALL46 MEMBER',status:member.status,
    accessType:member.accessType||null,currentPeriodEnd:member.currentPeriodEnd||null,
    cancelAtPeriodEnd:Boolean(member.cancelAtPeriodEnd)}
});
export async function handleProfileRequest(request,env,auth){
  const url=new URL(request.url);
  const page=url.pathname==='/member'&&url.searchParams.get('view')==='profile';
  const api=url.pathname==='/api/member/profile';
  if(!page&&!api)return null;
  if(!['GET','PUT'].includes(request.method)||page&&request.method!=='GET')return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const [identity,member]=await Promise.all([auth.verifyAccessIdentity(request,env),auth.memberAccess(request,env)]);
  if(!identity?.email||member?.status!=='ACTIVE')return reply({ok:false,error:'MEMBERSHIP_AUTH_REQUIRED'},401);
  if(page){
    const assetUrl=new URL('/profile-v2.html',url.origin);
    const response=await env.ASSETS.fetch(new Request(assetUrl));
    const headers=new Headers(response.headers);
    for(const [name,value] of Object.entries(HEADERS))headers.set(name,value);
    headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    return new Response(response.body,{status:response.status,headers});
  }
  if(!env.MEMBER_PROFILES)return reply({ok:false,error:'PROFILE_STORAGE_UNAVAILABLE'},503);
  const userKey=await profileKey(identity.email);
  try{
    if(request.method==='GET'){
      const record=await env.MEMBER_PROFILES.prepare('SELECT * FROM member_profiles WHERE user_key = ?').bind(userKey).first();
      return reply({ok:true,profile:profileView(record,identity,member)});
    }
    if(request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return reply({ok:false,error:'ORIGIN_NOT_ALLOWED'},403);
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return reply({ok:false,error:'JSON_REQUIRED'},415);
    let input;try{input=validateProfile(await readBody(request));}catch(error){return reply({ok:false,error:error.message},error.message==='BODY_TOO_LARGE'?413:400);}
    const updatedAt=new Date().toISOString();
    const values=[input.displayName,input.avatar,input.locale,input.timeZone,input.reducedMotion?1:0,updatedAt];
    let result;
    if(input.version===0){
      result=await env.MEMBER_PROFILES.prepare('INSERT OR IGNORE INTO member_profiles (user_key, display_name, avatar, locale, time_zone, reduced_motion, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)').bind(userKey,...values).run();
    }else{
      result=await env.MEMBER_PROFILES.prepare('UPDATE member_profiles SET display_name = ?, avatar = ?, locale = ?, time_zone = ?, reduced_motion = ?, updated_at = ?, version = version + 1 WHERE user_key = ? AND version = ?').bind(...values,userKey,input.version).run();
    }
    if(result.meta?.changes!==1)return reply({ok:false,error:'PROFILE_CONFLICT'},409);
    return reply({ok:true,profile:profileView({display_name:input.displayName,avatar:input.avatar,locale:input.locale,time_zone:input.timeZone,reduced_motion:input.reducedMotion,updated_at:updatedAt,version:input.version+1},identity,member)});
  }catch{return reply({ok:false,error:'PROFILE_STORAGE_UNAVAILABLE'},503);}
}
