(()=>{
'use strict';
const runtime=window.NOMAD342_RUNTIME||{};
const primaryBase=String(runtime.engineBase||'').trim().replace(/\/$/,'');
const directBase=String(runtime.defaultEngineBase||'').trim().replace(/\/$/,'');
const canaryBase='https://nomadtips3-live-web-production-canary.mccarey-supon.workers.dev/nomad-live-342';
const feedPath=String(runtime.feedPath||'/feed');

if(typeof window.fetch!=='function'||!primaryBase)return;

const previousFetch=window.fetch.bind(window);
const bases=[...new Set([primaryBase,directBase,canaryBase].filter(Boolean))];
const feedUrls=bases.map(base=>`${base}${feedPath}`);

function requestUrl(input){
  if(typeof input==='string')return input;
  if(input&&typeof input.url==='string')return input.url;
  return '';
}
function sourceBase(input){
  const url=requestUrl(input).split('#')[0];
  return bases.find(base=>url===`${base}${feedPath}`||url.startsWith(`${base}${feedPath}?`))||'';
}
function valid342(data){
  return Boolean(data&&String(data.version)==='3.42'&&Array.isArray(data.matches)&&data.ok!==false);
}
function degraded342(data){
  return valid342(data)&&(data.degraded===true||String(data.fallback||'').toUpperCase()==='LAST_GOOD');
}
function targetFor(base,input){
  const source=requestUrl(input);
  let query='';
  try{query=new URL(source,location.href).search}catch{}
  return `${base}${feedPath}${query}`;
}
async function requestBase(base,args,isPrimaryAttempt){
  if(isPrimaryAttempt)return previousFetch(...args);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const options={...(args[1]||{}),signal:controller.signal,cache:'no-store'};
    return await previousFetch(targetFor(base,args[0]),options);
  }finally{clearTimeout(timer)}
}
async function inspect(response){
  if(!response?.ok)return {valid:false,fresh:false,data:null};
  let data=null;
  try{data=await response.clone().json()}catch{}
  const valid=valid342(data);
  return {valid,fresh:valid&&!degraded342(data),data};
}

window.fetch=async function(...args){
  const requestedBase=sourceBase(args[0]);
  if(!requestedBase)return previousFetch(...args);

  const order=[requestedBase,...bases.filter(base=>base!==requestedBase)];
  let firstResponse=null;
  let degradedResponse=null;
  let firstError=null;

  for(let i=0;i<order.length;i++){
    const base=order[i];
    try{
      const response=await requestBase(base,args,i===0);
      if(!firstResponse)firstResponse=response;
      const state=await inspect(response);
      if(state.fresh)return response;
      if(state.valid&&!degradedResponse)degradedResponse=response;
    }catch(error){
      if(!firstError)firstError=error;
    }
  }

  if(degradedResponse)return degradedResponse;
  if(firstResponse)return firstResponse;
  if(firstError)throw firstError;
  return previousFetch(...args);
};

window.__nomad342FeedDirectFailover=Object.freeze({
  routes:Object.freeze(feedUrls),
  mode:'MULTI_ROUTE_342_FEED',
  fallbackTimeoutMs:6000
});
})();
