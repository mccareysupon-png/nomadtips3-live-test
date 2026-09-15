export function renderControlPage(){
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>NOMAD 3.41 · API Control</title>
<style>
:root{color-scheme:dark;font-family:Arial,sans-serif}*{box-sizing:border-box}body{margin:0;background:#0b0e0b;color:#eef2ee}.shell{max-width:920px;margin:auto;padding:18px}.brand{font-size:22px;font-weight:900;letter-spacing:.02em}.brand span{color:#f0d31c}.sub{margin:5px 0 20px;color:#8f9990;font-size:12px}.panel{background:#111611;border:1px solid #253027;padding:16px;margin:10px 0}.status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.card{background:#0e120e;border:1px solid #222a23;padding:12px;min-height:84px}.card small{display:block;color:#7f8980;font-size:10px;text-transform:uppercase}.card strong{display:block;margin-top:10px;font-size:19px;overflow-wrap:anywhere}.good{color:#8be594}.warn{color:#f0d31c}.bad{color:#ff8585}.master{width:100%;border:0;padding:20px 16px;font-size:20px;font-weight:900;cursor:pointer;background:#1f5c31;color:#baffc2}.master.stop{background:#602c2c;color:#fff}.master:disabled{opacity:.45;cursor:wait}.line{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #202720;font-size:12px}.line:last-child{border-bottom:0}.muted{color:#8f9990}.note{font-size:11px;line-height:1.6;color:#9ba39c}.endpoint{font-family:Consolas,monospace;font-size:10px;color:#8be594;word-break:break-all}.flash{min-height:22px;margin-top:10px;font-size:12px;font-weight:700}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.pill{font-size:10px;border:1px solid #344036;padding:7px 9px;color:#9ba39c}@media(max-width:700px){.status{grid-template-columns:repeat(2,1fr)}.shell{padding:10px}}@media(max-width:420px){.status{grid-template-columns:1fr}}
</style>
</head>
<body><main class="shell">
<div class="top"><div><div class="brand">nomad<span>tips3</span> · 3.41</div><div class="sub">5USD CENTRAL FULL-BOARD CONTROL</div></div><div class="pill" id="machine">—</div></div>
<section class="panel"><div class="status">
<div class="card"><small>Hard Gate</small><strong id="gate">—</strong></div>
<div class="card"><small>API Switch</small><strong id="api">—</strong></div>
<div class="card"><small>Polling</small><strong id="poll">—</strong></div>
<div class="card"><small>Effective</small><strong id="effective">—</strong></div>
<div class="card"><small>Live Fixtures</small><strong id="live">—</strong></div>
<div class="card"><small>Requests / Cycle</small><strong id="requests">—</strong></div>
<div class="card"><small>Rate Remaining</small><strong id="rate">—</strong></div>
<div class="card"><small>Snapshot Age</small><strong id="age">—</strong></div>
</div></section>
<section class="panel"><button id="master" class="master" disabled>CHECKING…</button><div id="flash" class="flash muted"></div><div class="note">One click controls the central API switch and polling together. Opening match cards, Statistics, Health or this page never calls 5USD directly.</div></section>
<section class="panel"><div class="line"><span>Request plan</span><strong>1 full board / cycle</strong></div><div class="line"><span>Concurrent provider calls</span><strong>Maximum 1</strong></div><div class="line"><span>Match-card provider calls</span><strong>0</strong></div><div class="line"><span>Price Referee provider calls</span><strong>0</strong></div><div class="line"><span>Routine cadence</span><strong>60 seconds</strong></div><div class="endpoint">GET /v1/fixtures?status=live&amp;include=odds,events,stats&amp;per_page=500</div></section>
<section class="panel"><div class="line"><span>Stats coverage</span><strong id="stats">—</strong></div><div class="line"><span>Events</span><strong id="events">—</strong></div><div class="line"><span>Odds quotes</span><strong id="odds">—</strong></div><div class="line"><span>Bookmakers</span><strong id="books">—</strong></div><div class="line"><span>Last run</span><strong id="lastRun">—</strong></div><div class="line"><span>Last 429</span><strong id="last429">—</strong></div></section>
</main>
<script>
(()=>{
 const $=id=>document.getElementById(id);let control=null,busy=false;
 const set=(id,text,kind)=>{const e=$(id);e.textContent=text??'—';e.className=kind||''};
 async function jget(path){const r=await fetch(path,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j}
 async function refresh(){
   try{
     const [c,d]=await Promise.all([jget('/api/nomad341/control'),jget('/api/nomad341/check')]);control=c;
     set('gate',c.hardProviderGate?'READY':'BLOCKED',c.hardProviderGate?'good':'bad');set('api',c.apiArmed?'ON':'OFF',c.apiArmed?'good':'bad');set('poll',c.pollingEnabled?'ON':'OFF',c.pollingEnabled?'good':'bad');set('effective',c.effectiveProviderEnabled?'LIVE':'STOPPED',c.effectiveProviderEnabled?'good':'warn');
     $('machine').textContent=(c.machineAllowed?'ACTIVE · ':'LOCKED · ')+(c.currentMachineId||'—');
     set('live',String(d.snapshot?.normalizedCount??0));set('requests',String(d.request?.providerRequestsThisCycle??0),Number(d.request?.providerRequestsThisCycle)<=1?'good':'bad');set('rate',d.rateLimit?.remaining??'—');set('age',d.snapshot?.ageSeconds==null?'—':d.snapshot.ageSeconds+'s');
     set('stats',(d.coverage?.statsMatches??0)+'/'+(d.snapshot?.normalizedCount??0));set('events',String(d.coverage?.totalEvents??0));set('odds',String(d.coverage?.priceQuotes??0));set('books',(d.coverage?.bookmakers||[]).join(', ')||'—');set('lastRun',c.lastRunResult||'NEVER');set('last429',d.last429?.at||'none',d.last429?'warn':'good');
     const b=$('master');b.disabled=busy||!c.hardProviderGate;b.textContent=c.apiArmed?'STOP API':'OPEN API';b.className='master'+(c.apiArmed?' stop':'');
     if(!c.hardProviderGate)$('flash').textContent='Hard Gate is not ready. Do not open API.';
   }catch(e){$('flash').textContent='CONTROL ERROR · '+e.message;$('master').disabled=true;}
 }
 $('master').addEventListener('click',async()=>{if(!control||busy)return;busy=true;$('master').disabled=true;$('flash').textContent='Applying central switch…';try{const enabled=!control.apiArmed;const r=await fetch('/api/nomad341/master',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled})});const j=await r.json();if(!r.ok)throw new Error(j.error||('HTTP '+r.status));$('flash').textContent=enabled?'API OPENED · first central cycle is starting.':'API STOPPED · no new 5USD cycles will run.';}catch(e){$('flash').textContent='SWITCH ERROR · '+e.message;}finally{busy=false;await refresh();}});
 refresh();setInterval(refresh,5000);
})();
</script></body></html>`;
}
