const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?verify='+Date.now(),{headers:{'cache-control':'no-cache'}});
const t=await r.text();
const checks={
 http:r.status,
 lazyMarker:t.includes('B46_FULLMARKET_LAZY_ONDEMAND_20261110'),
 collapsedDefault:t.includes("active=info.books.some(b=>b.slug===saved.active)?saved.active:''"),
 collapsedPanel:t.includes("panelSig='__collapsed__'"),
 clickSameCollapse:t.includes("saved.active===clicked?'':clicked"),
 clickRender:t.includes("panel.innerHTML=renderBookHtml(fixture,active,info)"),
 perfPatch:t.includes('B46_FULLMARKET_INSPECT_CACHE_20261110'),
 networkNone:t.includes("networkMode:'NONE'"),
 noAddedApiLiteral:!t.includes('B46_LAZY_EXTRA_API')
};
console.log(JSON.stringify(checks));
if(r.status!==200||Object.entries(checks).some(([k,v])=>k!=='http'&&v!==true))process.exit(1);
