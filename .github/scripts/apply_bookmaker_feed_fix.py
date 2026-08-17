from pathlib import Path

p=Path('car3-1-hybrid-live-engine/worker/src/upgrade.js')
s=p.read_text(encoding='utf-8')
old="function oddsSource(config){return `${SOURCE_ODDS_BASE}/runOddsData_${bookmakerId(config)}.txt`;}"
new="function oddsSource(config){const id=bookmakerId(config);return id===50?`${SOURCE_ODDS_BASE}/goal50.xml`:`${SOURCE_ODDS_BASE}/runOddsData_${id}.txt`;}\nfunction oddsSourceLabel(config){const id=bookmakerId(config);return id===50?'goal50.xml':`runOddsData_${id}`;}"
assert old in s, 'oddsSource marker missing'
s=s.replace(old,new,1)
marker='\n// Only codes confirmed from the public client are named. Other codes remain generic.\n'
assert marker in s, 'parser insertion marker missing'
inject="""
function hkDecimal(raw){
  const v=number(raw);if(v===null)return null;
  return v>=0?Number((1+v).toFixed(3)):null;
}

// Generic Goaloo goal{companyId}.xml current-odds feed.
// Field layout verified against goal8.xml and goal50.xml on 2026-08-17:
// matchId, ahOddsId, ahLine, ahHomeHK, ahAwayHK,
// 1x2OddsId, home, draw, away, ouOddsId, ouLine, overHK, underHK, ...
export function parseGoalOddsXml(source,providerCompanyId=50){
  const out=new Map(),re=/<m>([^<]+)<\\/m>/g;
  for(const m of String(source||'').matchAll(re)){
    const row=m[1].split(',').map(v=>String(v??'').trim()),id=row[0];
    if(!/^\\d+$/.test(id||''))continue;
    const ahLine=number(row[2]),ahHome=number(row[3]),ahAway=number(row[4]);
    const oneHome=number(row[6]),oneDraw=number(row[7]),oneAway=number(row[8]);
    const ouLine=number(row[10]),ouOver=number(row[11]),ouUnder=number(row[12]);
    const record={
      oneXtwo:oneHome!==null&&oneDraw!==null&&oneAway!==null?{home:oneHome,draw:oneDraw,away:oneAway,raw:{home:oneHome,draw:oneDraw,away:oneAway}}:null,
      asianHandicap:ahLine!==null&&ahHome!==null&&ahAway!==null?{home:hkDecimal(ahHome),line:ahLine,away:hkDecimal(ahAway),raw:{home:ahHome,away:ahAway}}:null,
      overUnder:ouLine!==null&&ouOver!==null&&ouUnder!==null?{over:hkDecimal(ouOver),line:ouLine,under:hkDecimal(ouUnder),raw:{over:ouOver,under:ouUnder}}:null,
      providerCompanyId:Number(providerCompanyId)||50,
      providerName:BOOKMAKERS[Number(providerCompanyId)]||`Company ${providerCompanyId}`
    };
    if(record.oneXtwo||record.asianHandicap||record.overUnder)out.set(id,record);
  }
  return out;
}

function parseBookmakerOdds(source,providerCompanyId){
  return Number(providerCompanyId)===50?parseGoalOddsXml(source,providerCompanyId):parseRunOdds(source,providerCompanyId);
}
"""
s=s.replace(marker,'\n'+inject+marker,1)
a='parseRunOdds(oddsSourceText,providerCompanyId)'
b='parseBookmakerOdds(oddsSourceText,providerCompanyId)'
assert a in s, 'scan parser call missing'
s=s.replace(a,b)
a='parseRunOdds(oddsResult.value,providerCompanyId)'
b='parseBookmakerOdds(oddsResult.value,providerCompanyId)'
assert a in s, 'live parser call missing'
s=s.replace(a,b)
token='`runOddsData_${providerCompanyId}`'
count=s.count(token)
assert count>=2, f'expected >=2 source labels, got {count}'
s=s.replace(token,'oddsSourceLabel(config)')
p.write_text(s,encoding='utf-8')

t=Path('car3-1-hybrid-live-engine/test/bookmaker-goalxml.test.js')
t.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoalOddsXml} from '../worker/src/upgrade.js';

test('parse Goaloo goal50.xml current odds and HK prices',()=>{
  const xml=\"<?xml version='1.0'?><c><match><m>3018359,17535243,0,1.20,0.63,156460524,3.03,3.24,2.21,20216243,2.25,0.83,0.90,1,0,0,0,3,3,3,,,,</m></match></c>\";
  const row=parseGoalOddsXml(xml,50).get('3018359');
  assert.equal(row.providerCompanyId,50);
  assert.equal(row.providerName,'1xBet');
  assert.equal(row.oneXtwo.home,3.03);
  assert.equal(row.oneXtwo.draw,3.24);
  assert.equal(row.oneXtwo.away,2.21);
  assert.equal(row.asianHandicap.line,0);
  assert.equal(row.asianHandicap.home,2.20);
  assert.equal(row.asianHandicap.away,1.63);
  assert.equal(row.overUnder.line,2.25);
  assert.equal(row.overUnder.over,1.83);
  assert.equal(row.overUnder.under,1.90);
});
""",encoding='utf-8')
