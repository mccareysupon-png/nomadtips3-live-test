from pathlib import Path
import re

app = Path('car3-1-hybrid-live-engine/web/app.js')
s = app.read_text(encoding='utf-8')
old = "snapshots=snaps.snapshots||[];matches=(live.matches||[]).map(adapt);$('#lastUpdate').textContent=live.generatedAt?new Date(live.generatedAt).toLocaleTimeString():'live collector';render();}"
new = "snapshots=snaps.snapshots||[];const activeRows=(live.matches||[]).filter(row=>{const status=String(row?.status||'').toUpperCase();return status!=='FT'&&!status.includes('FINISH');});window.__CAR31_LIVE_ROWS__=activeRows;matches=activeRows.map(adapt);if(selected>=matches.length)selected=Math.max(0,matches.length-1);$('#lastUpdate').textContent=live.generatedAt?new Date(live.generatedAt).toLocaleTimeString():'live collector';render();window.dispatchEvent(new CustomEvent('car31:live-updated'));}"
if old not in s:
    raise SystemExit('app.js live assignment target not found')
s = s.replace(old, new, 1)
old_interval = "setInterval(()=>load().catch(()=>{}),30000);"
if old_interval not in s:
    raise SystemExit('app.js refresh interval target not found')
s = s.replace(old_interval, "setInterval(()=>load().catch(()=>{}),5000);", 1)
app.write_text(s, encoding='utf-8')

polish = Path('car3-1-hybrid-live-engine/web/signal-polish.js')
s = polish.read_text(encoding='utf-8')
pattern = re.compile(r"async function refresh\(\)\{\n.*?\n\}\n\ndocument\.addEventListener", re.S)
replacement = """async function refresh(){
  runtime=runtime||await fetch('./runtime.json',{cache:'no-store'}).then(r=>r.json());
  const history=await fetch(`${runtime.workerUrl}/history?page=1&limit=100&t=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()).catch(()=>({records:[]}));
  historyRecords=history.records||[];
  liveRows=Array.isArray(window.__CAR31_LIVE_ROWS__)?window.__CAR31_LIVE_ROWS__:[];
  apply();
}

window.addEventListener('car31:live-updated',()=>{
  liveRows=Array.isArray(window.__CAR31_LIVE_ROWS__)?window.__CAR31_LIVE_ROWS__:[];
  apply();
});

document.addEventListener"""
s2, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit('signal-polish.js refresh block target not found')
polish.write_text(s2, encoding='utf-8')
