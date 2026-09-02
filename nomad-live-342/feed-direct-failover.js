(()=>{
'use strict';
const runtime=window.NOMAD342_RUNTIME||{};
const primaryBase=String(runtime.engineBase||'').trim().replace(/\/$/,'');
const directBase=String(runtime.defaultEngineBase||'').trim().replace(/\/$/,'');
const feedPath=String(runtime.feedPath||'/feed');

if(typeof window.fetch!=='function'||!primaryBase||!directBase||primaryBase===directBase)return;

const previousFetch=window.fetch.bind(window);
const primaryUrl=`${primaryBase}${feedPath}`;
const directUrl=`${directBase}${feedPath}`;

function requestUrl(input){
  if(typeof input==='string')return input;
  if(input&&typeof input.url==='string')return input.url;
  return '';
}
function isPrimaryFeed(input){
  const url=requestUrl(input).split('#')[0];
  return url===primaryUrl||url.startsWith(`${primaryUrl}?`);
}
function valid342(data){
  return Boolean(data&&String(data.version)==='3.42'&&Array.isArray(data.matches)&&data.ok!==false);
}
function isLastGood(data){
  return valid342(data)&&(data.degraded===true||String(data.fallback||'').toUpperCase()==='LAST_GOOD');
}
function directRequestArgs(args){
  const source=requestUrl(args[0]);
  let query='';
  try{query=new URL(source,location.href).search}catch{}
  const target=`${directUrl}${query}`;
  let input=target;
  try{
    if(typeof Request==='function'&&args[0] instanceof Request)input=new Request(target,args[0]);
  }catch{}
  return [input,args[1]];
}

window.fetch=async function(...args){
  if(!isPrimaryFeed(args[0]))return previousFetch(...args);

  const primaryResponse=await previousFetch(...args);
  if(!primaryResponse?.ok)return primaryResponse;

  let primaryData=null;
  try{primaryData=await primaryResponse.clone().json()}catch{}
  if(!isLastGood(primaryData))return primaryResponse;

  try{
    const directResponse=await previousFetch(...directRequestArgs(args));
    if(!directResponse?.ok)return primaryResponse;
    let directData=null;
    try{directData=await directResponse.clone().json()}catch{}
    if(valid342(directData)&&!isLastGood(directData))return directResponse;
  }catch{}

  return primaryResponse;
};

window.__nomad342FeedDirectFailover=Object.freeze({
  primary:primaryUrl,
  direct:directUrl,
  mode:'LAST_GOOD_TO_DIRECT_WORKER'
});
})();
