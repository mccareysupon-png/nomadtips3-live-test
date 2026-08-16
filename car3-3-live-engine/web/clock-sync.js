const CLOCK_WORKER='https://nomadtips3-car33-live.mccarey-supon.workers.dev';
const sourceClocks=new Map();
let busy=false,applying=false;
const fmt=c=>{if(!c)return null;if(c.status==='FT')return'FT';if(c.status==='HT')return'HT';const s=Number(c.elapsedSeconds);if(!Number.isFinite(s)||s<0)return Number.isFinite(Number(c.minute))?`${Math.max(0,Math.floor(Number(c.minute)))}'`:null;const whole=Math.floor(s);return`${Math.floor(whole/60)}:${String(whole%60).padStart(2,'0')}`;};
function apply(){if(applying)return;applying=true;try{document.querySelectorAll('[data-clock]').forEach(el=>{const text=fmt(sourceClocks.get(String(el.dataset.clock)));if(text&&el.textContent!==text)el.textContent=text;});}finally{applying=false;}}
async function syncClock(){if(busy)return;busy=true;try{const r=await fetch(`${CLOCK_WORKER}/clock?t=${Date.now()}`,{cache:'no-store'});const p=await r.json();if(p?.ok&&Array.isArray(p.clocks)){sourceClocks.clear();for(const c of p.clocks)sourceClocks.set(String(c.id),c);apply();}}catch{}finally{busy=false;}}
const observer=new MutationObserver(()=>queueMicrotask(apply));
observer.observe(document.body,{subtree:true,childList:true,characterData:true});
setInterval(syncClock,1500);syncClock();
