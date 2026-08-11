const OWNER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#151718">
  <title>NOMADTIPS3 — Owner Settings</title>
  <style>
    :root{color-scheme:dark;--bg:#151718;--s1:#1d2021;--s2:#232627;--s3:#2a2e2f;--text:#f1f3f3;--muted:#9ba3a0;--faint:#6f7774;--green:#36a866;--green-soft:rgba(54,168,102,.14);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text)}body{background:linear-gradient(180deg,#181a1b 0%,#151718 55%,#141616 100%)}button,input,select{font:inherit}.shell{width:min(1180px,calc(100% - 28px));margin:0 auto}.topbar{background:linear-gradient(180deg,#202324,#1c1f20)}.topbar-inner{min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:18px}.brand{font-weight:800;letter-spacing:-.035em;font-size:21px}.brand span{color:var(--green)}.mode{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}main{padding:22px 0 40px}.hero{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:18px}h1{margin:0;font-size:clamp(22px,3vw,32px);letter-spacing:-.04em}.sub{color:var(--muted);margin-top:5px;font-size:13px}.section{margin-top:18px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.section-title{font-size:13px;font-weight:760;text-transform:uppercase;letter-spacing:.055em}.section-note{color:var(--faint);font-size:12px}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;background:linear-gradient(180deg,var(--s1),#1a1d1e);border-radius:10px;padding:16px}.field{display:grid;gap:6px}label{color:var(--muted);font-size:12px}input,select{width:100%;border:0;outline:none;border-radius:7px;background:var(--s3);color:var(--text);padding:10px 11px}input:focus,select:focus{box-shadow:inset 0 0 0 1px rgba(54,168,102,.65)}.actions{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}.btn{border:0;border-radius:7px;padding:9px 14px;background:var(--s3);color:var(--text);font-weight:700;cursor:pointer}.btn.primary{background:var(--green);color:#07130c}.btn:disabled{cursor:not-allowed;opacity:.5}.feedback{color:var(--muted);font-size:12px}.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 8px;font-size:11px;background:var(--s3);color:var(--muted)}.dot{width:7px;height:7px;border-radius:50%;background:var(--faint)}.dot.online{background:var(--green);box-shadow:0 0 0 4px var(--green-soft)}
    @media(max-width:760px){.shell{width:min(100% - 18px,1180px)}.topbar-inner{min-height:52px}.hero{align-items:start;flex-direction:column}.form-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header class="topbar"><div class="shell topbar-inner"><div class="brand">NOMAD<span>TIPS3</span></div><div class="mode">Live Engine V2 · Owner</div></div></header>
  <main class="shell">
    <div class="hero"><div><h1>Owner Settings</h1><div class="sub">Private scanner configuration · protected by Cloudflare Access</div></div><div class="pill"><span id="ownerDot" class="dot"></span><span id="ownerStatus">Checking</span></div></div>
    <section class="section">
      <div class="section-head"><div class="section-title">Scanner Configuration</div><div id="versionText" class="section-note">Version —</div></div>
      <div class="form-grid">
        <div class="field"><label for="enabled">Scanner</label><select id="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></div>
        <div class="field"><label for="scoreState">Score state</label><select id="scoreState"><option>ANY</option><option>TIED</option><option>HOME_LEADING</option><option>AWAY_LEADING</option></select></div>
        <div class="field"><label for="minuteMin">Minute min</label><input id="minuteMin" type="number" min="0" max="120" value="1"></div>
        <div class="field"><label for="minuteMax">Minute max</label><input id="minuteMax" type="number" min="1" max="140" value="120"></div>
        <div class="field"><label for="goalGapEnabled">Goal-gap rule</label><select id="goalGapEnabled"><option value="false">Off</option><option value="true">On</option></select></div>
        <div class="field"><label for="maxGoalGap">Max goal gap</label><input id="maxGoalGap" type="number" min="0" max="20" value="99"></div>
        <div class="field"><label for="statisticsEnabled">Statistics detail</label><select id="statisticsEnabled"><option value="false">Off</option><option value="true">On</option></select></div>
        <div class="field"><label for="liveOddsEnabled">Live odds detail</label><select id="liveOddsEnabled"><option value="false">Off</option><option value="true">On</option></select></div>
        <div class="field"><label for="statisticsTtl">Statistics TTL (sec)</label><input id="statisticsTtl" type="number" min="30" max="600" value="60"></div>
        <div class="field"><label for="oddsTtl">Live odds TTL (sec)</label><input id="oddsTtl" type="number" min="5" max="60" value="10"></div>
      </div>
      <div class="actions"><button id="reloadBtn" class="btn">Reload</button><button id="saveBtn" class="btn primary" disabled>Save Configuration</button><span id="saveFeedback" class="feedback">Checking owner access…</span></div>
    </section>
  </main>
<script>
(function(){
  'use strict';
  var configVersion = null;
  function $(id){ return document.getElementById(id); }
  function boolValue(id){ return $(id).value === 'true'; }
  function numberValue(id,fallback){ var value=Number($(id).value); return Number.isFinite(value)?value:fallback; }
  function setAuthorized(ok){ $('saveBtn').disabled=!ok; $('ownerStatus').textContent=ok?'Owner':'Locked'; $('ownerDot').classList.toggle('online',ok); }
  function fill(config){ config=config||{}; $('enabled').value=String(config.enabled===undefined?true:config.enabled); $('scoreState').value=(config.score_states||['ANY'])[0]||'ANY'; $('minuteMin').value=config.minute_min===undefined?1:config.minute_min; $('minuteMax').value=config.minute_max===undefined?120:config.minute_max; $('goalGapEnabled').value=String(config.goal_gap_enabled===undefined?false:config.goal_gap_enabled); $('maxGoalGap').value=config.max_goal_gap===undefined?99:config.max_goal_gap; $('statisticsEnabled').value=String(config.statistics_enabled===undefined?false:config.statistics_enabled); $('liveOddsEnabled').value=String(config.live_odds_enabled===undefined?false:config.live_odds_enabled); $('statisticsTtl').value=config.statistics_ttl_seconds===undefined?60:config.statistics_ttl_seconds; $('oddsTtl').value=config.live_odds_ttl_seconds===undefined?10:config.live_odds_ttl_seconds; }
  function collect(){ return {enabled:boolValue('enabled'),statuses:['1H','HT','2H','ET','BT','P','INT','LIVE'],minute_min:numberValue('minuteMin',1),minute_max:numberValue('minuteMax',120),goal_gap_enabled:boolValue('goalGapEnabled'),max_goal_gap:numberValue('maxGoalGap',99),score_states:[$('scoreState').value],statistics_enabled:boolValue('statisticsEnabled'),live_odds_enabled:boolValue('liveOddsEnabled'),statistics_ttl_seconds:numberValue('statisticsTtl',60),live_odds_ttl_seconds:numberValue('oddsTtl',10)}; }
  async function jsonResponse(response){ var data=await response.json(); if(!response.ok||!data||!data.ok) throw new Error((data&&data.error)||('HTTP '+response.status)); return data; }
  async function loadConfig(){ $('saveFeedback').textContent='Loading owner configuration…'; try{ var response=await fetch('/v2/owner/config',{method:'GET',credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}); var data=await jsonResponse(response); var current=data.ownerConfig||{version:0,config:{}}; configVersion=current.version||0; fill(current.config||{}); $('versionText').textContent='Version '+configVersion; $('saveFeedback').textContent='Owner access confirmed.'; setAuthorized(true); }catch(error){ configVersion=null; setAuthorized(false); $('saveFeedback').textContent=error.message||'Owner access required.'; } }
  async function saveConfig(){ if(configVersion===null)return; $('saveBtn').disabled=true; $('saveFeedback').textContent='Saving…'; try{ var response=await fetch('/v2/owner/config',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({expectedVersion:configVersion,config:collect()})}); if(response.status===409)throw new Error('Configuration changed. Reload before saving again.'); var data=await jsonResponse(response); configVersion=data.ownerConfig&&data.ownerConfig.version!==undefined?data.ownerConfig.version:configVersion; $('versionText').textContent='Version '+configVersion; $('saveFeedback').textContent='Saved.'; }catch(error){ $('saveFeedback').textContent=error.message||'Save failed.'; }finally{ $('saveBtn').disabled=configVersion===null; } }
  $('reloadBtn').addEventListener('click',loadConfig); $('saveBtn').addEventListener('click',saveConfig); setAuthorized(false); loadConfig();
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
