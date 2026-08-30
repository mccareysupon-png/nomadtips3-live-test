(()=>{
  const host=String(window.location.hostname||'').toLowerCase();
  const PROD_BOUND_HOSTS=new Set([
    'www.nomadtips3.com',
    'nomadtips3.com',
    'nomadtips3-live-web-production-canary.mccarey-supon.workers.dev',
  ]);
  const TEST_BOUND_HOSTS=new Set([
    'nomadtips3-live-web-test.mccarey-supon.workers.dev',
  ]);
  const PROD_DIRECT_HOSTS=new Set([
    'mccareysupon-png.github.io',
  ]);
  const boundProduction=PROD_BOUND_HOSTS.has(host);
  const directProduction=PROD_DIRECT_HOSTS.has(host);
  const production=boundProduction||directProduction;
  const test=TEST_BOUND_HOSTS.has(host);
  const runtime=Object.freeze({
    environment:production?'production':'test',
    engineBase:directProduction
      ?'https://nomadtips3-live-engine.mccarey-supon.workers.dev'
      :'/api',
    transport:directProduction?'direct':'service-binding',
    production,
    test,
    host,
  });
  window.NOMAD_RUNTIME=runtime;
  document.documentElement.dataset.nomadEnvironment=runtime.environment;

  if(!/\/settings\.html$/i.test(window.location.pathname)) return;

  const byLabel=text=>[...document.querySelectorAll('.field')].find(field=>String(field.querySelector('label')?.textContent||'').trim()===text);
  const sideField=byLabel('Side');
  if(!sideField) return;
  sideField.classList.remove('readonly');
  const label=sideField.querySelector('label');
  if(label) label.textContent='Detection Side';
  const oldInput=sideField.querySelector('input');
  const select=document.createElement('select');
  select.id='targetSideMode';
  select.required=true;
  select.innerHTML='<option value="HOME">HOME</option><option value="AWAY">AWAY</option><option value="BOTH">BOTH</option>';
  select.value='HOME';
  if(oldInput) oldInput.replaceWith(select); else sideField.append(select);
  let activeSide='HOME';

  const replaceText=(selector,from,to)=>{
    document.querySelectorAll(selector).forEach(node=>{
      if(String(node.textContent||'').trim()===from) node.textContent=to;
    });
  };
  replaceText('.hero .eyebrow','HOME LIVE AH CONTROL','LIVE AH CONTROL');
  replaceText('.setting-section .eyebrow','B · HOME EVIDENCE','B · SIDE EVIDENCE');
  replaceText('.setting-section .eyebrow','C · HOME ASIAN HANDICAP','C · ASIAN HANDICAP');
  replaceText('.field > label','HOME Pressure Share %','Selected Side Pressure Share %');
  replaceText('.field > label','New HOME Event Gate','New Selected Side Event Gate');
  replaceText('.field > label','Selected HOME Lines','Selected Side Lines');
  document.querySelectorAll('.checkline').forEach(node=>{
    if(/Require a new HOME event/i.test(node.textContent||'')){
      [...node.childNodes].forEach(child=>{if(child.nodeType===Node.TEXT_NODE&&/Require a new HOME event/i.test(child.textContent||'')) child.textContent=' Require a new selected-side event';});
    }
  });
  const selectedOption=document.querySelector('#allowedLinesMode option[value="SELECTED"]');
  if(selectedOption) selectedOption.textContent='Selected side lines';
  const linesHint=document.getElementById('linesHint');
  if(linesHint) linesHint.textContent='Use Ctrl/Cmd or Shift to select multiple quarter-goal lines for the selected side.';

  const validSide=value=>['HOME','AWAY','BOTH'].includes(String(value||'').toUpperCase())?String(value).toUpperCase():null;
  const syncActiveTile=()=>{
    const item=[...document.querySelectorAll('#activeSettings .active-item')].find(card=>String(card.querySelector('span')?.textContent||'').trim().toLowerCase()==='side');
    if(item?.querySelector('b')) item.querySelector('b').textContent=activeSide;
  };
  const active=document.getElementById('activeSettings');
  if(active) new MutationObserver(syncActiveTile).observe(active,{childList:true,subtree:true});

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:(input?.url||'');
    const isConfig=/\/config(?:\?|$)/.test(url);
    const method=String(init?.method||'GET').toUpperCase();
    let nextInit=init;
    if(isConfig&&method==='POST'&&typeof init?.body==='string'){
      try{
        const body=JSON.parse(init.body);
        if(body?.config&&typeof body.config==='object'){
          body.config.targetSideMode=select.value;
          nextInit={...init,body:JSON.stringify(body)};
        }
      }catch{}
    }
    const response=await nativeFetch(input,nextInit);
    if(isConfig){
      response.clone().json().then(data=>{
        if(method==='GET'){
          const current=validSide(data?.activeConfig?.targetSideMode??data?.config?.targetSideMode);
          if(current){activeSide=current;select.value=current;}
        }else{
          const current=validSide(data?.active?.config?.targetSideMode);
          if(current) activeSide=current;
        }
        queueMicrotask(syncActiveTile);
      }).catch(()=>{});
    }
    return response;
  };
})();
