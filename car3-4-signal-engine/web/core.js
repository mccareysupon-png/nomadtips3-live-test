export const CAR34={version:'CAR 3.4',workerUrl:'https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev',refreshMs:30000};
export const $=id=>document.getElementById(id);
export const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dt=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'medium'});}catch{return String(v)}};
export const clock=v=>{if(!v)return'—';try{return new Date(v).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{return String(v)}};
export const line=v=>v===null||v===undefined||v===''?'—':`${Number(v)>=0?'+':''}${v}`;
export const resultOf=r=>{const raw=String(r?.resultGroup||r?.result||r?.status||'PENDING').toUpperCase();if(['CORRECT','WIN'].includes(raw))return'WIN';if(['INCORRECT','LOSS'].includes(raw))return'LOSS';if(['PUSH','DRAW'].includes(raw))return'DRAW';if(raw==='VOID')return'VOID';return'PENDING'};
export async function api(path,options={}){const sep=path.includes('?')?'&':'?';const response=await fetch(`${CAR34.workerUrl}${path}${sep}t=${Date.now()}`,{cache:'no-store',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw new Error(data?.error||`HTTP ${response.status}`);return data;}
export const getConfig=()=>api('/config');
export const saveConfig=config=>api('/config',{method:'POST',body:JSON.stringify(config)});
export async function getHistory(page=1,limit=50){return api(`/history?page=${page}&limit=${limit}`)}
export const getHealth=()=>api('/health');