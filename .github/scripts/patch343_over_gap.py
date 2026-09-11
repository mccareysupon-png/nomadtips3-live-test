from pathlib import Path


def replace_one(path, old, new):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:140]!r}')
    p.write_text(s.replace(old, new, 1), encoding='utf-8')


replace_one(
    'nomad-live-343/settings.html',
    '      <label><span>เส้น Over ไม่เกิน</span><input name="lineMax" type="number" min="0.5" max="10" step="0.5" required></label>',
    '      <label><span>ระยะห่าง Over Line จากสกอร์รวม ไม่เกิน</span><select name="lineGapMax" required><option value="0.5">0.5</option><option value="1">1.0</option><option value="1.5">1.5</option><option value="2">2.0</option><option value="2.5">2.5</option><option value="999">ไม่จำกัด</option></select><small>ระบบคำนวณ Over Line − ประตูรวมปัจจุบันอัตโนมัติ · เช่น 3-1 / O4.5 = ระยะห่าง 0.5</small></label>'
)
replace_one('nomad-live-343/settings.html','settings.js?v=20260910-343-server-v1','settings.js?v=20260911-343-over-gap-v1')
replace_one('nomad-live-343/settings.js',' over:{lineMin:0.5,lineMax:10,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},',' over:{lineMin:0.5,lineGapMax:0.5,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},')
replace_one('nomad-live-343/settings.js',"function mergeSettings(raw){const out={};for(const m of MARKETS)out[m]={...clone(DEFAULTS[m]),...(raw?.[m]||{})};return out}","function mergeSettings(raw){const out={};for(const m of MARKETS){out[m]={...clone(DEFAULTS[m]),...(raw?.[m]||{})};if(m==='over')delete out[m].lineMax}return out}")
replace_one('nomad-live-343/settings.js',"if(m==='over'&&c.lineMin>c.lineMax)e.push('เส้น Over ตั้งแต่ ต้องไม่มากกว่า เส้น Over ไม่เกิน');return e}","if(m==='over'&&![0.5,1,1.5,2,2.5,999].includes(Number(c.lineGapMax)))e.push('ระยะห่าง Over Line จากสกอร์รวม ต้องเลือก 0.5, 1.0, 1.5, 2.0, 2.5 หรือไม่จำกัด');return e}")

Path('workers/nomadtips3-343-auto-engine/src/over-gap.js').write_text("""const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
export function currentGoalTotal(score){const home=finite(score?.home??score?.[0]),away=finite(score?.away??score?.[1]);return home===null||away===null?null:home+away;}
export function overLineGap(line,score){const n=finite(line),total=currentGoalTotal(score);if(n===null||total===null||!Number.isInteger(n*4))return null;const gap=Number((n-total).toFixed(2));return gap<0?null:gap;}
export function overGapPass(line,score,maxGap){const gap=overLineGap(line,score),limit=finite(maxGap);return gap!==null&&limit!==null&&(limit===999||gap<=limit);}
""", encoding='utf-8')

replace_one('workers/nomadtips3-343-auto-engine/src/index.js',"import { DurableObject } from 'cloudflare:workers';","import { DurableObject } from 'cloudflare:workers';\nimport { overLineGap, overGapPass } from './over-gap.js';")
replace_one('workers/nomadtips3-343-auto-engine/src/index.js','  over:{lineMin:0.5,lineMax:10,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},','  over:{lineMin:0.5,lineGapMax:0.5,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},')
replace_one('workers/nomadtips3-343-auto-engine/src/index.js',"  if(market==='over'&&(line<Number(cfg.lineMin)||line>Number(cfg.lineMax)))return {pass:false,stage:'LINE',side,evidence:ev,line};","  if(market==='over'){if(line<Number(cfg.lineMin))return {pass:false,stage:'LINE_MIN',side,evidence:ev,line};const lineGap=overLineGap(line,f.goals);if(!overGapPass(line,f.goals,cfg.lineGapMax))return {pass:false,stage:lineGap===null?'LINE_GAP_UNAVAILABLE':'LINE_GAP',side,evidence:ev,line,lineGap};return {pass:true,stage:'PREPASS',side,evidence:ev,line,lineGap};}")
replace_one('workers/nomadtips3-343-auto-engine/src/index.js',"function pricePass(market,cfg,price){if(price?.odds===null||price?.odds===undefined||price.odds<Number(cfg.oddsMin))return false;if(market==='over')return price.line!==null&&price.line>=Number(cfg.lineMin)&&price.line<=Number(cfg.lineMax);if(market==='under'||market==='ah')return price.line!==null&&price.line>=Number(cfg.lineMin);return true}","function pricePass(market,cfg,price,score){if(price?.odds===null||price?.odds===undefined||price.odds<Number(cfg.oddsMin))return false;if(market==='over')return price.line!==null&&price.line>=Number(cfg.lineMin)&&overGapPass(price.line,score,cfg.lineGapMax);if(market==='under'||market==='ah')return price.line!==null&&price.line>=Number(cfg.lineMin);return true}")
replace_one('workers/nomadtips3-343-auto-engine/src/index.js',"function sanitizeSettings(input,current=DEFAULT_SETTINGS){const out=clone(current);for(const market of Object.keys(DEFAULT_SETTINGS))if(input?.[market]&&typeof input[market]==='object')out[market]={...out[market],...input[market]};return out}","function sanitizeSettings(input,current=DEFAULT_SETTINGS){const out=clone(current);for(const market of Object.keys(DEFAULT_SETTINGS))if(input?.[market]&&typeof input[market]==='object')out[market]={...out[market],...input[market]};delete out.over.lineMax;return out}")
replace_one('workers/nomadtips3-343-auto-engine/src/index.js',"if(best)preCandidates.push({fixtureId:f.fixtureId,market,side:best.side,minute:f.minute,home:f.home.name,away:f.away.name,league:f.league.name,score:f.goals,evidence:best.evidence,price:best.price??null,line:best.line??null,observedAt:t});","if(best)preCandidates.push({fixtureId:f.fixtureId,market,side:best.side,minute:f.minute,home:f.home.name,away:f.away.name,league:f.league.name,score:f.goals,evidence:best.evidence,price:best.price??null,line:best.line??null,lineGap:best.lineGap??null,observedAt:t});")
replace_one('workers/nomadtips3-343-auto-engine/src/index.js',"        if(!pricePass(c.market,cfg,price)){candidates.push({...c,stage:'PRICE_REJECT',price});continue}\n        const candidate={...c,stage:'PASS',price};candidates.push(candidate);","        const lineGap=c.market==='over'?overLineGap(price?.line,c.score):c.lineGap??null;\n        if(!pricePass(c.market,cfg,price,c.score)){candidates.push({...c,stage:'PRICE_REJECT',price,lineGap});continue}\n        const candidate={...c,stage:'PASS',price,lineGap};candidates.push(candidate);")

test=Path('workers/nomadtips3-343-auto-engine/test/over-gap.test.mjs')
test.parent.mkdir(parents=True, exist_ok=True)
test.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import {currentGoalTotal,overLineGap,overGapPass} from '../src/over-gap.js';
test('3-1 max gap 0.5 accepts O4.25/O4.5',()=>{const s={home:3,away:1};assert.equal(currentGoalTotal(s),4);assert.equal(overLineGap(4.25,s),0.25);assert.equal(overLineGap(4.5,s),0.5);assert.equal(overGapPass(4.25,s,0.5),true);assert.equal(overGapPass(4.5,s,0.5),true)});
test('3-1 max gap 0.5 rejects O4.75/O5.0',()=>{const s={home:3,away:1};assert.equal(overLineGap(4.75,s),0.75);assert.equal(overLineGap(5,s),1);assert.equal(overGapPass(4.75,s,0.5),false);assert.equal(overGapPass(5,s,0.5),false)});
test('larger gaps and unlimited mode',()=>{const s={home:2,away:1};assert.equal(overGapPass(4.5,s,1.5),true);assert.equal(overGapPass(5.5,s,2.5),true);assert.equal(overGapPass(9.75,s,999),true)});
test('stale negative gap and missing score reject',()=>{assert.equal(overLineGap(3.5,{home:3,away:1}),null);assert.equal(overGapPass(3.5,{home:3,away:1},0.5),false);assert.equal(overGapPass(4.5,null,0.5),false)});
""", encoding='utf-8')
