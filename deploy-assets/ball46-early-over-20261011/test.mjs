import assert from "node:assert/strict";
import vm from "node:vm";
import { core } from "./helper-core.mjs";
import { transitions } from "./helper-transitions.mjs";
import { processLive } from "./helper-process.mjs";
import { patch } from "./patch.mjs";
const env={
 now:()=>1730001000000,clone:x=>structuredClone(x),num:x=>x==null?null:Number(x),
 SETTLEMENT_REVISION:"bet365-rules-v2",
 MARKET_RULES:{ft_over:{period:"FT",basis:"goals"},ht_over:{period:"HT",basis:"goals"},ft_corner_over:{period:"FT",basis:"corners"},ht_corner_over:{period:"HT",basis:"corners"}},
 isLive:f=>f.boardState==="live",isFinished:f=>f.boardState==="finished",
 isHalfComplete:f=>f.boardState==="half_time"||f.minute>=46,
 periodCompleteForSignal:(s,f)=>s.market.startsWith("ht_")?(f.boardState==="half_time"||f.minute>=46):f.boardState==="finished",
 settleOu:(t,l,sel)=>{const v=Number(l),parts=v*2===Math.round(v*2)?[v]:[Math.floor(v*2)/2,Math.ceil(v*2)/2];return sel==="OVER"?parts.every(x=>t>x)?"WIN":parts.some(x=>t>x)?"HALF_WIN":"PUSH":null;}
};
env.settleMarketSignal=(s,f)=>{const d=env.MARKET_RULES[s.market];if(!d)return null;const p=f[d.basis],h=d.period==="HT"?p?.halfHome:p?.home,a=d.period==="HT"?p?.halfAway:p?.away;return Number.isFinite(h)&&Number.isFinite(a)?env.settleOu(h+a,s.line,s.selection):null;};
const ctx=vm.createContext({...env,structuredClone});
vm.runInContext(core+transitions+processLive+"\nthis.phase2=phase2ApplyLive",ctx);
const sig=(market,line,entry)=>({id:"S",fixtureId:"F",status:"PENDING",result:"PENDING",market,selection:"OVER",line,createdAt:100,[market.includes("corner")?"entryCorners":"entryScore"]:entry});
const frame=(goals,corners={home:0,away:0},minute=70,boardState="live")=>({fixtureId:"F",goals,corners,minute,boardState});
const check=(s,f,t=200,stale=false)=>ctx.phase2([s],new Map([["F",f]]),t,stale);
const g=sig("ft_over",2.5,{home:1,away:0});
assert.equal(check(g,frame({home:2,away:1}),100).length,0);
assert.equal(check(g,frame({home:2,away:1})).length,1);assert.equal(g.result,"WIN");
assert.equal(check(g,frame({home:1,away:1})).length,1);assert.equal(g.status,"PENDING");
assert.equal(check(g,frame({home:2,away:1})).length,1);assert.equal(g.result,"WIN");
assert.equal(check(g,frame({home:2,away:1},{home:0,away:0},90,"finished")).length,1);
const c=sig("ft_corner_over",9.5,{home:5,away:4});
assert.equal(check(c,frame({home:0,away:0},{home:6,away:4})).length,1);
const q=sig("ft_over",3.75,{home:1,away:0});
assert.equal(check(q,frame({home:3,away:1})).length,0);
const h=sig("ht_over",1.5,{home:1,away:0});
assert.equal(check(h,frame({home:2,away:0},{home:0,away:0},39)).length,1);
const hc=sig("ht_corner_over",5.5,{home:2,away:2});
assert.equal(check(hc,frame({home:0,away:0},{home:4,away:2},39)).length,1);
console.log("PHASE2_FUNCTION_TESTS_PASS");
if(process.env.B46_ACTIVE_SOURCE){const fs=await import("node:fs");const s=fs.readFileSync(process.env.B46_ACTIVE_SOURCE,"utf8");const p=patch(s);assert(p.length>s.length);console.log("PHASE2_ACTIVE_PATCH_PARSE_PASS");}
