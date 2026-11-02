export const MODES=[{id:'DEFAULT',seconds:30},{id:'FAST',seconds:20},{id:'ULTRA',seconds:15}];
// Preview projection only: Production must reserve shared quota before every request.
export const RATE_PROFILES=[...MODES,{id:'MAX6',seconds:6},{id:'MAX3',seconds:3},{id:'MAX2',seconds:2}];
export function retryUntil(value,at){if(value==null||String(value).trim()==='')return at+60000;const n=Number(value);if(Number.isFinite(n)&&n>=0)return at+Math.max(1000,n*1000);const date=Date.parse(value);return Number.isFinite(date)?Math.max(at+1000,date):at+60000}
export function recommend(state,at=Date.now()){
 const current=state.currentSeconds??30;
 if([401,402,403].includes(state.httpStatus))return{state:'HOLD',seconds:null,reason:'ตรวจสิทธิ์และข้อผิดพลาด HTTP '+state.httpStatus+' ก่อนส่งคำขอเพิ่ม',eligible:[]};
 if(state.httpStatus===429||Number(state.cooldownUntil)>at)return{state:'COOLDOWN',seconds:null,until:state.httpStatus===429?Math.max(Number(state.cooldownUntil)||0,retryUntil(state.retryAfter,at)):Number(state.cooldownUntil),reason:'พักคำขอร่วมกันทั้งบัญชีตาม Retry-After',eligible:[]};
 const p=state.quota,pages=state.livePages??1;
 if(!Number.isSafeInteger(pages)||pages<1)return{state:'LOCKED',seconds:current,reason:'ยังยืนยันจำนวนหน้าต่อรอบไม่ได้',eligible:[]};
 if(!p||p.coverage!=='ALL_WORKERS_AND_KEYS'||!p.verified||!Number.isFinite(p.expiresAt)||p.expiresAt<=at||!Number.isFinite(p.limit)||p.limit<=0||!Number.isFinite(p.otherReserved)||p.otherReserved<0||!Number.isFinite(p.scheduleReserved)||p.scheduleReserved<0||!Number.isFinite(p.safetyReserve)||p.safetyReserve<0||!Number.isFinite(p.remaining)||p.remaining<pages)return{state:'LOCKED',seconds:current,reason:'ยังยืนยันโควตารวมทุก Worker และทุก Key ไม่ครบ',eligible:[]};
 const budget=p.limit-p.otherReserved-p.scheduleReserved-p.safetyReserve;
 const eligible=RATE_PROFILES.filter(m=>Math.ceil(60/m.seconds)*pages<=budget);
 if(!eligible.length)return{state:'HOLD',seconds:null,budget,reason:'งบไม่พอสำหรับ Bulk รอบถัดไป ต้องให้ตัวจัดสรรกลางพักคำขอ',eligible:[]};
 const seconds=Math.min(...eligible.map(m=>m.seconds)),next=RATE_PROFILES.filter(m=>m.seconds<seconds).sort((a,b)=>b.seconds-a.seconds)[0];return{state:'READY',seconds,budget,livePages:pages,requestRpm:Math.ceil(60/seconds)*pages,nextFaster:next?{seconds:next.seconds,requestRpm:Math.ceil(60/next.seconds)*pages}:null,eligible:eligible.map(m=>m.id),reason:'คำนวณหลังหักงบระบบเดิม ตารางแข่ง และส่วนเผื่อแล้ว'}
}
export function waitSavings(current,selected){return{averageSeconds:Math.max(0,(current-selected)/2),bulkRequestsPerMinute:60/selected,assumption:'ประมาณเวลารอรอบคงที่และเหตุการณ์เกิดสม่ำเสมอ ไม่รวมต้นทาง เครือข่าย หรือเวลาเผยแพร่'}}
