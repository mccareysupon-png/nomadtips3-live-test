import productionWeb from './index.js';

const ADD_K_PREFIX='/add-k-ah-api';
const ADD_K_ALLOWED=new Set(['/config','/signals','/status']);
const INTERNAL_HEADER='x-add-k-internal';

function responseJson(value,status=200){
  return new Response(JSON.stringify(value),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store'
    }
  });
}

async function proxyAddK(request,env,url){
  if(url.pathname!==ADD_K_PREFIX&&!url.pathname.startsWith(ADD_K_PREFIX+'/'))return null;
  if(!env?.ADD_K_ENGINE||typeof env.ADD_K_ENGINE.fetch!=='function'){
    return responseJson({ok:false,error:'ADD K service binding unavailable'},503);
  }
  const path=url.pathname.slice(ADD_K_PREFIX.length)||'/';
  if(!ADD_K_ALLOWED.has(path))return responseJson({ok:false,error:'ADD K route not allowed'},404);
  if(path!=='/config'&&request.method!=='GET')return responseJson({ok:false,error:'Method not allowed'},405);
  if(path==='/config'&&!['GET','POST'].includes(request.method))return responseJson({ok:false,error:'Method not allowed'},405);

  const target=new URL(path+url.search,'https://add-k-ah-detector.internal');
  const headers=new Headers(request.headers);
  headers.delete(INTERNAL_HEADER);
  headers.set(INTERNAL_HEADER,'web');
  const internalRequest=new Request(target.toString(),{
    method:request.method,
    headers,
    body:['GET','HEAD'].includes(request.method)?undefined:request.body,
    redirect:'manual'
  });
  const response=await env.ADD_K_ENGINE.fetch(internalRequest);
  const outHeaders=new Headers(response.headers);
  outHeaders.set('cache-control','no-store');
  outHeaders.set('x-nomad-web','add-k-internal-bridge');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:outHeaders});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const addK=await proxyAddK(request,env,url);
    if(addK)return addK;
    return productionWeb.fetch(request,env,ctx);
  }
};
