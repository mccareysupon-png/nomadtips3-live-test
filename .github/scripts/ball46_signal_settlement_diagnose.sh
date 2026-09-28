#!/usr/bin/env bash
set -euo pipefail
ROOT='/tmp/b46-signal-diagnose'; CAND='/tmp/pre/candidate'; rm -rf "$ROOT"; mkdir -p "$ROOT"
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = 79 ] || { echo CAND_NOT_79; exit 1; }
cat > "$ROOT/proxy.py" <<'PY'
import os,urllib.request
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
ROOT='/tmp/pre/candidate'; UP='https://ball46-production.mccarey-supon.workers.dev'; os.chdir(ROOT)
class H(SimpleHTTPRequestHandler):
 def do_GET(self):
  print('GET',self.path,flush=True)
  if self.path.startswith('/api/engine/'):
   try:
    with urllib.request.urlopen(UP+self.path,timeout=30) as q:
     b=q.read(); self.send_response(q.status); self.send_header('Content-Type',q.headers.get('Content-Type','application/json')); self.send_header('Cache-Control','no-store'); self.end_headers(); self.wfile.write(b); print('UP',q.status,len(b),flush=True)
   except Exception as e: print('ERR',repr(e),flush=True); self.send_error(502,str(e))
  else: super().do_GET()
ThreadingHTTPServer(('127.0.0.1',8766),H).serve_forever()
PY
python3 "$ROOT/proxy.py" >"$ROOT/proxy.log" 2>&1 & PPID2=$!; trap 'kill $PPID2 ${CPID:-} 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:8766/ >/dev/null 2>&1 && break; sleep .25; done
CHROME=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$CHROME" ] || exit 1
"$CHROME" --headless=new --no-sandbox --disable-gpu --window-size=1440,1050 --remote-debugging-port=9338 --user-data-dir="$ROOT/chrome" "http://127.0.0.1:8766/?diag=1" >"$ROOT/chrome.log" 2>&1 & CPID=$!
for i in $(seq 1 60); do curl -fsS http://127.0.0.1:9338/json > "$ROOT/pages.json" 2>/dev/null && python3 -c "import json; x=json.load(open('$ROOT/pages.json')); assert any(p.get('type')=='page' and p.get('webSocketDebuggerUrl') for p in x)" 2>/dev/null && break; sleep .5; done
cat > "$ROOT/check.js" <<'NODE'
const fs=require('fs'),pages=JSON.parse(fs.readFileSync('/tmp/b46-signal-diagnose/pages.json')),p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');
const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,q=new Map(),events=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown'||m.method==='Log.entryAdded'||m.method==='Runtime.consoleAPICalled')events.push(m);if(m.id&&q.has(m.id)){const x=q.get(m.id);q.delete(m.id);m.error?x.j(Error(JSON.stringify(m.error))):x.r(m.result)}};const call=(method,params={})=>new Promise((r,j)=>{const n=++id;q.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}))});const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function ev(x){const z=await call('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});if(z.exceptionDetails)throw Error(JSON.stringify(z.exceptionDetails));return z.result.value}
(async()=>{await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});await call('Runtime.enable');await call('Log.enable');await call('Page.enable');await call('Page.bringToFront');await sleep(7000);const state=await ev(`({ready:document.readyState,visibility:document.visibilityState,cards:document.querySelectorAll('[data-scorebar-signal-result]').length,slot:document.querySelector('[data-workspace-scorebar-slot]')?.innerText,resources:performance.getEntriesByType('resource').map(x=>x.name).filter(x=>x.includes('/api/engine/')),hasDashboard:!!window.NOMAD343_DASHBOARD_V2})`);const direct=await ev(`fetch('/api/engine/statistics?diag='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(j=>({ok:j.ok,rows:Array.isArray(j.rows)?j.rows.length:-1,first:j.rows?.[0]?.result||null})).catch(e=>({error:String(e)}))`);await sleep(2500);const after=await ev(`({visibility:document.visibilityState,cards:document.querySelectorAll('[data-scorebar-signal-result]').length,slot:document.querySelector('[data-workspace-scorebar-slot]')?.innerText,resources:performance.getEntriesByType('resource').map(x=>x.name).filter(x=>x.includes('/api/engine/'))})`);const out={state,direct,after,events:events.slice(-30)};console.log('DIAG',JSON.stringify(out));fs.writeFileSync('/tmp/b46-signal-diagnose/diag.json',JSON.stringify(out,null,2));ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
node "$ROOT/check.js"
cat "$ROOT/proxy.log"
kill "$CPID" "$PPID2" 2>/dev/null || true; trap - EXIT
echo SIGNAL_SETTLEMENT_DIAG_SUCCESS
