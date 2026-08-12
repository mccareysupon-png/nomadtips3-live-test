const OWNER_HTML = String.raw`<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#111514">
  <title>NOMADTIPS3 — VPS Bot Owner</title>
  <style>
    :root{color-scheme:dark;--bg:#111514;--panel:#1a201e;--field:#252d2a;--line:#303a36;--text:#eef4f1;--muted:#9aaba4;--green:#3bd17f;--red:#ff7474;--amber:#f2c260;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#1c2823 0,transparent 35%),var(--bg);color:var(--text)}button,input,select{font:inherit}.shell{width:min(1180px,calc(100% - 28px));margin:auto}.top{border-bottom:1px solid var(--line);background:rgba(17,21,20,.92);position:sticky;top:0;z-index:3;backdrop-filter:blur(12px)}.topin{min-height:58px;display:flex;align-items:center;justify-content:space-between}.brand{font-weight:900;font-size:20px;letter-spacing:-.04em}.brand span{color:var(--green)}.tag{font-size:11px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}main{padding:22px 0 48px}.hero{display:flex;gap:14px;align-items:end;justify-content:space-between}h1{font-size:clamp(24px,4vw,36px);margin:0;letter-spacing:-.05em}.sub,.note{color:var(--muted);font-size:12px}.sub{margin-top:5px}.pill{display:flex;align-items:center;gap:7px;background:var(--field);padding:7px 10px;border-radius:999px;font-size:12px}.dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}.dot.online{background:var(--green);box-shadow:0 0 0 4px rgba(59,209,127,.13)}.metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:9px;margin-top:18px}.metric,.panel{background:linear-gradient(180deg,var(--panel),#171c1a);border:1px solid rgba(255,255,255,.035);border-radius:11px}.metric{padding:13px}.label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.value{font-size:22px;font-weight:800;margin-top:6px}.value.small{font-size:14px;line-height:1.5}.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin-top:12px}.panel{padding:16px}.head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.055em}.form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}.field{display:grid;gap:5px}label{font-size:11px;color:var(--muted)}input,select{width:100%;border:1px solid transparent;outline:none;background:var(--field);color:var(--text);border-radius:7px;padding:9px 10px}input:focus,select:focus{border-color:var(--green)}.fixed{padding:10px;background:rgba(59,209,127,.08);color:var(--green);border-radius:7px;font-size:12px}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.btn{border:0;border-radius:7px;padding:9px 13px;background:var(--field);color:var(--text);font-weight:750;cursor:pointer}.btn.primary{background:var(--green);color:#08140d}.btn:disabled{opacity:.45;cursor:not-allowed}.rows{display:grid;gap:7px;max-height:410px;overflow:auto}.row{padding:10px;background:rgba(255,255,255,.025);border-radius:8px;display:grid;grid-template-columns:1fr auto;gap:5px 12px}.main{font-size:13px;font-weight:700}.meta{font-size:11px;color:var(--muted)}.good{color:var(--green)}.bad{color:var(--red)}.warn{color:var(--amber)}.empty{padding:20px;text-align:center;color:var(--muted);font-size:12px}.error{margin-top:10px;color:var(--red);font-size:12px;overflow-wrap:anywhere}
    @media(max-width:920px){.metrics{grid-template-columns:repeat(3,1fr)}.grid{grid-template-columns:1fr}}@media(max-width:580px){.shell{width:calc(100% - 18px)}.hero{align-items:start;flex-direction:column}.metrics{grid-template-columns:repeat(2,1fr)}.form{grid-template-columns:1fr}.tag{display:none}}
  </style>
</head>
<body>
  <header class="top"><div class="shell topin"><div class="brand">NOMAD<span>TIPS3</span></div><div class="tag">Car 3 · VPS · PAPER ONLY</div></div></header>
  <main class="shell">
    <div class="hero"><div><h1>VPS Bot Control</h1><div class="sub">ตั้งค่าและตรวจสอบเครื่องตรวจจับบอลสด Car 3 · ไม่มีเพดาน 10 สัญญาณ</div></div><div class="pill"><span id="ownerDot" class="dot"></span><span id="ownerStatus">Checking</span></div></div>
    <section class="metrics">
      <div class="metric"><div class="label">Engine</div><div id="engineMode" class="value small">—</div></div>
      <div class="metric"><div class="label">Live</div><div id="liveCount" class="value">—</div></div>
      <div class="metric"><div class="label">Candidates</div><div id="candidateCount" class="value">—</div></div>
      <div class="metric"><div class="label">Signals</div><div id="signalCount" class="value">—</div></div>
      <div class="metric"><div class="label">API Remaining</div><div id="apiRemaining" class="value small">—</div></div>
      <div class="metric"><div class="label">Last Update</div><div id="lastUpdate" class="value small">—</div></div>
    </section>
    <div id="runtimeError" class="error"></div>
    <section class="grid">
      <div class="panel">
        <div class="head"><div class="title">Car 3 Conditions</div><div id="versionText" class="note">Version —</div></div>
        <div class="form">
          <div class="field"><label for="enabled">Scanner</label><select id="enabled"><option value="true">Enabled</option><option value="false">Stopped</option></select></div>
          <div class="field"><label for="side">Selected side</label><select id="side"><option>HOME</option><option>AWAY</option><option>BOTH</option></select></div>
          <div class="field"><label for="minuteMin">Minute min</label><input id="minuteMin" type="number" min="1" max="119"></div>
          <div class="field"><label for="minuteMax">Minute max</label><input id="minuteMax" type="number" min="1" max="120"></div>
          <div class="field"><label for="market">Market</label><select id="market"><option>WIN</option><option>AH</option></select></div>
          <div class="field"><label for="oddsMin">Odds min</label><input id="oddsMin" type="number" min="1.01" max="100" step="0.01"></div>
          <div class="field"><label for="oddsMax">Odds max (ว่าง = ไม่จำกัด)</label><input id="oddsMax" type="number" min="1.01" max="100" step="0.01"></div>
          <div class="field"><label for="ahMin">AH min</label><input id="ahMin" type="number" min="-5" max="5" step="0.25"></div>
          <div class="field"><label for="ahMax">AH max (ว่าง = ไม่จำกัด)</label><input id="ahMax" type="number" min="-5" max="5" step="0.25"></div>
          <div class="field"><label for="momentumMin">Momentum min (%)</label><input id="momentumMin" type="number" min="1" max="99"></div>
          <div class="field"><label for="attackEvidence">Attack evidence</label><select id="attackEvidence"><option value="false">Off</option><option value="true">On</option></select></div>
          <div class="field"><label for="confirmationRounds">Confirmation rounds</label><input id="confirmationRounds" type="number" min="1" max="10"></div>
          <div class="field"><label for="goalGapEnabled">Goal-gap rule</label><select id="goalGapEnabled"><option value="false">Off</option><option value="true">On</option></select></div>
          <div class="field"><label for="maxGoalGap">Max goal gap</label><input id="maxGoalGap" type="number" min="0" max="99"></div>
          <div class="field"><label for="statisticsTtl">Statistics TTL (sec)</label><input id="statisticsTtl" type="number" min="30" max="600"></div>
          <div class="field"><label for="oddsTtl">Live odds TTL (sec)</label><input id="oddsTtl" type="number" min="5" max="60"></div>
          <div class="field"><label>Signal policy</label><div class="fixed">UNLIMITED · no daily cap</div></div>
          <div class="field"><label>Execution safety</label><div class="fixed">PAPER_ONLY · WOULD_EXECUTE</div></div>
        </div>
        <div class="actions"><button id="reloadBtn" class="btn">Reload</button><button id="saveBtn" class="btn primary" disabled>Save Configuration</button><span id="saveFeedback" class="note">Checking owner access…</span></div>
      </div>
      <div>
        <div class="panel"><div class="head"><div class="title">Active Candidates</div><div id="candidateNote" class="note"></div></div><div id="candidateRows" class="rows"><div class="empty">Waiting for VPS state.</div></div></div>
        <div class="panel" style="margin-top:12px"><div class="head"><div class="title">Recent Signals</div><div class="note">PAPER</div></div><div id="signalRows" class="rows"><div class="empty">No signals yet.</div></div></div>
      </div>
    </section>
  </main>
<script>
(function(){
  'use strict';
  var version=null;
  function $(id){return document.getElementById(id)}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c]})}
  function bool(id){return $(id).value==='true'}
  function num(id,fallback){var value=Number($(id).value);return Number.isFinite(value)?value:fallback}
  function nullable(id){var raw=$(id).value.trim();if(!raw)return null;var value=Number(raw);return Number.isFinite(value)?value:null}
  function pick(config,snake,camel,fallback){return config[snake]!==undefined?config[snake]:(config[camel]!==undefined?config[camel]:fallback)}
  function authorized(ok){$('saveBtn').disabled=!ok;$('ownerStatus').textContent=ok?'Owner Access':'Locked';$('ownerDot').classList.toggle('online',ok)}
  function fill(c){c=c||{};$('enabled').value=String(pick(c,'enabled','enabled',true));$('side').value=pick(c,'side','side','BOTH');$('minuteMin').value=pick(c,'minute_min','minuteMin',50);$('minuteMax').value=pick(c,'minute_max','minuteMax',89);$('market').value=pick(c,'market','market','AH');$('oddsMin').value=pick(c,'odds_min','oddsMin',1.2);$('oddsMax').value=pick(c,'odds_max','oddsMax','')??'';$('ahMin').value=pick(c,'ah_min','ahMin',.75);$('ahMax').value=pick(c,'ah_max','ahMax','')??'';$('momentumMin').value=pick(c,'momentum_min','momentumMin',10);$('attackEvidence').value=String(pick(c,'attack_evidence_enabled','attackEvidenceEnabled',false));$('confirmationRounds').value=pick(c,'confirmation_rounds','confirmationRounds',1);$('goalGapEnabled').value=String(pick(c,'goal_gap_enabled','goalGapLimited',false));$('maxGoalGap').value=pick(c,'max_goal_gap','maxGoalGap',99);$('statisticsTtl').value=pick(c,'statistics_ttl_seconds','statistics_ttl_seconds',60);$('oddsTtl').value=pick(c,'live_odds_ttl_seconds','live_odds_ttl_seconds',15)}
  function collect(){return{enabled:bool('enabled'),statuses:['1H','HT','2H','ET','BT','P','INT','LIVE'],side:$('side').value,minute_min:num('minuteMin',50),minute_max:num('minuteMax',89),market:$('market').value,odds_min:num('oddsMin',1.2),odds_max:nullable('oddsMax'),ah_min:num('ahMin',.75),ah_max:nullable('ahMax'),momentum_min:num('momentumMin',10),attack_evidence_enabled:bool('attackEvidence'),confirmation_rounds:num('confirmationRounds',1),goal_gap_enabled:bool('goalGapEnabled'),max_goal_gap:num('maxGoalGap',99),score_states:['ANY'],statistics_enabled:true,live_odds_enabled:true,statistics_ttl_seconds:num('statisticsTtl',60),live_odds_ttl_seconds:num('oddsTtl',15),signal_limit_enabled:false,signal_limit:null,signal_limit_policy:'UNLIMITED'}}
  async function json(response){var data=await response.json();if(!response.ok||!data||!data.ok)throw new Error((data&&data.error)||('HTTP '+response.status));return data}
  async function loadConfig(){try{var data=await json(await fetch('/v2/owner/config',{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}));var current=data.ownerConfig||{version:0,config:{}};version=current.version||0;fill(current.config||{});$('versionText').textContent='Version '+version;$('saveFeedback').textContent='Owner access confirmed.';authorized(true)}catch(error){version=null;authorized(false);$('saveFeedback').textContent=error.message||'Owner access required.'}}
  async function save(){if(version===null)return;$('saveBtn').disabled=true;$('saveFeedback').textContent='Saving…';try{var response=await fetch('/v2/owner/config',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({expectedVersion:version,config:collect()})});if(response.status===409)throw new Error('Configuration changed; reload first.');var data=await json(response);version=data.ownerConfig.version;$('versionText').textContent='Version '+version;$('saveFeedback').textContent='Saved. VPS will reload automatically.'}catch(error){$('saveFeedback').textContent=error.message||'Save failed.'}finally{$('saveBtn').disabled=version===null}}
  function ago(iso){var ms=Date.parse(iso||'');if(!Number.isFinite(ms))return '—';var sec=Math.max(0,Math.round((Date.now()-ms)/1000));if(sec<60)return sec+'s ago';if(sec<3600)return Math.round(sec/60)+'m ago';return Math.round(sec/3600)+'h ago'}
  function rows(id,items,render,empty){$(id).innerHTML=items.length?items.map(render).join(''):'<div class="empty">'+esc(empty)+'</div>'}
  function renderCandidate(row){return '<div class="row"><div><div class="main">'+esc(row.selected_team)+' · '+esc(row.side)+'</div><div class="meta">'+esc(row.opponent)+' · '+esc(row.minute)+'&prime; · '+esc(row.score)+'</div></div><div class="good">'+esc(row.momentum==null?'warming':row.momentum+'%')+'</div><div class="meta">'+esc(row.market)+' · AH '+esc(row.ah_line==null?'—':row.ah_line)+'</div><div class="meta">streak '+esc(row.streak)+'</div></div>'}
  function renderSignal(row){return '<div class="row"><div><div class="main">'+esc(row.selected_team||row.selection)+' · '+esc(row.market)+'</div><div class="meta">'+esc(row.home)+' vs '+esc(row.away)+' · '+esc(row.minute)+'&prime;</div></div><div class="good">'+esc(row.confidence)+'%</div><div class="meta">'+esc(ago(row.created_at))+'</div><div class="meta">PAPER</div></div>'}
  async function loadStatus(){try{var data=await json(await fetch('/v2/owner/status',{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}));var state=data.state||{};var payload=state.payload||{};var engine=payload.engine||{};var runtime=payload.runtime||{};var counts=engine.counts||{};var generated=payload.generated_at||state.generatedAt;var fresh=Number.isFinite(Date.parse(generated||''))&&Date.now()-Date.parse(generated)<180000;var healthy=runtime.ok!==false&&fresh;$('engineMode').textContent=healthy?(engine.mode||'SCANNING'):(fresh?'DEGRADED':'STALE');$('engineMode').className='value small '+(healthy?'good':'bad');$('liveCount').textContent=payload.live_count??0;$('candidateCount').textContent=counts.red_safe??payload.preliminary_candidate_count??0;$('signalCount').textContent=(engine.recent_signals||[]).length;$('apiRemaining').textContent=(payload.rate_limit&&payload.rate_limit.minute_remaining!=null)?String(payload.rate_limit.minute_remaining):'—';$('lastUpdate').textContent=ago(generated);$('runtimeError').textContent=runtime.last_error?('Last error: '+runtime.last_error):'';var candidates=Array.isArray(engine.active_candidates)?engine.active_candidates:[];var signals=Array.isArray(engine.recent_signals)?engine.recent_signals:[];$('candidateNote').textContent=candidates.length+' shown';rows('candidateRows',candidates,renderCandidate,'No current candidate.');rows('signalRows',signals,renderSignal,'No signals recorded yet.')}catch(error){$('engineMode').textContent='Unavailable';$('engineMode').className='value small bad';$('runtimeError').textContent=error.message||'Status unavailable.'}}
  $('reloadBtn').addEventListener('click',function(){loadConfig();loadStatus()});$('saveBtn').addEventListener('click',save);authorized(false);loadConfig();loadStatus();setInterval(loadStatus,15000);
})();
</script>
</body>
</html>`;

export function handleOwnerPage(request) {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== 'bot-owner.nomadtips3.com') return null;
  if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
  if (url.pathname !== '/' && url.pathname !== '/bot-owner' && url.pathname !== '/bot-owner/') return null;
  return new Response(OWNER_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    }
  });
}
