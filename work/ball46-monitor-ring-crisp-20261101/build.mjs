import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const sha=x=>createHash('sha256').update(x).digest('hex');
const css=await readFile('before.css'),js=await readFile('before.js','utf8');assert.equal(sha(css),'33b106ad599a7f1b32d441d00189aa85e0ead20b3e07a11302b56577683d7d0c');assert.equal(sha(js),'c65cb04de3c6ea9abe9ab80955c16c1bd0a3a7e93d4473bc541bd85944705c4d');
const start=js.indexOf('const escape='),end=js.indexOf('/* BALL46 monitor:');assert(start>0&&end>start);const view=js.slice(start,end);assert(view.includes('function renderCard(')&&!view.includes('fetch('));
await writeFile('card.html',`<!doctype html><html data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="before.css"><style>html,body{margin:0;background:transparent}body{padding:2px}.mini-monitor{width:100%}</style><div id="card" class="mini-monitor b46-match-monitor b46-match-monitor-mini"></div><script>${view}
const q=new URLSearchParams(location.search);document.documentElement.dataset.theme=q.get('theme')||'dark';if(q.get('variant')==='after'){const l=document.createElement('link');l.rel='stylesheet';l.href='crisp.css';document.head.append(l)}
renderCard(document.getElementById('card'),{state:q.get('state')==='live'?'live':'awaiting',model:q.get('state')==='live'?{at:Date.now(),values:[52,27,21],whole:[52,27,21]}:null},{home:'Home',away:'Away'});
function control(data){for(const a of document.getAnimations()){if(data.type==='pause'){a.pause();if(Number.isFinite(data.time))a.currentTime=data.time}else if(data.type==='play')a.play()}}
addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent)control(e.data)});window.previewControl=control;
</script></html>`);
console.log('Exact Production monitor CSS/view verified; CSS-only comparison built');
