from pathlib import Path

CEO = Path('workers/nomadtips3-engine-343/src/ceo-condition.js')
INDEX = Path('workers/nomadtips3-engine-343/src/index.js')
TEST = Path('workers/nomadtips3-engine-343/test/ceo-condition.test.mjs')

ceo = CEO.read_text()
idx = INDEX.read_text()
test = TEST.read_text()

# Strategy version: historical rows stay v1.0; only future CEO signals become v1.1.
if "export const CEO_VERSION='1.0';" in ceo:
    ceo = ceo.replace("export const CEO_VERSION='1.0';", "export const CEO_VERSION='1.1';", 1)
elif "export const CEO_VERSION='1.1';" not in ceo:
    raise SystemExit('CEO_VERSION baseline mismatch')

# Conservative FT live-AH scope only. Other markets are intentionally unchanged.
old_price = "ft_1x2:{oddsMin:1.62,oddsMax:2.55},ft_ah:{oddsMin:1.58,oddsMax:2.35,lineMin:-1.25,lineMax:1.25},"
new_price = "ft_1x2:{oddsMin:1.62,oddsMax:2.55},ft_ah:{oddsMin:1.58,oddsMax:2.35,lineMin:-.5,lineMax:.5},"
if old_price in ceo:
    ceo = ceo.replace(old_price, new_price, 1)
elif new_price not in ceo:
    raise SystemExit('FT_AH price settings baseline mismatch')

# Live AH settlement measures goals AFTER entry. Avoid chasing a side already leading before 60'.
old_state = "const g=pair(f?.goals),trail=selection==='HOME'?(g.away??0)-(g.home??0):(g.home??0)-(g.away??0);\n  if(key.includes('1x2')&&trail>0)score-=18;if(key.includes('_ah')&&trail>1)score-=16;"
new_state = "const g=pair(f?.goals),trail=selection==='HOME'?(g.away??0)-(g.home??0):(g.home??0)-(g.away??0),minute=num(f?.minute);\n  if(key==='ft_ah'&&minute!==null&&minute<60&&trail<0)return null;\n  if(key.includes('1x2')&&trail>0)score-=18;if(key.includes('_ah')&&trail>1)score-=16;"
if old_state in ceo:
    ceo = ceo.replace(old_state, new_state, 1)
elif new_state not in ceo:
    raise SystemExit('FT_AH game-state baseline mismatch')

# Defense in depth after the existing referee picks a price. Keep the old 1.25 cap for every other AH market.
old_line = "const line=num(best?.price?.line);if(best.market?.includes('_ah')&&line!==null&&Math.abs(line)>1.25)return {pass:false,reason:'LINE_RISK'};"
new_line = "const line=num(best?.price?.line);if(best.market==='ft_ah'&&line!==null&&Math.abs(line)>.5)return {pass:false,reason:'LINE_RISK'};if(best.market!=='ft_ah'&&best.market?.includes('_ah')&&line!==null&&Math.abs(line)>1.25)return {pass:false,reason:'LINE_RISK'};"
if old_line in ceo:
    ceo = ceo.replace(old_line, new_line, 1)
elif new_line not in ceo:
    raise SystemExit('AH post-price baseline mismatch')

if "mode:'CEO_AUTO_V1'" in ceo:
    ceo = ceo.replace("mode:'CEO_AUTO_V1'", "mode:'CEO_AUTO_V1_1'", 1)
elif "mode:'CEO_AUTO_V1_1'" not in ceo:
    raise SystemExit('CEO evidence mode baseline mismatch')

old_engine = "const VERSION='nomad343-engine-v6-ceo-auto-v1';"
new_engine = "const VERSION='nomad343-engine-v6-ceo-auto-v1.1-ah-guard';"
if old_engine in idx:
    idx = idx.replace(old_engine, new_engine, 1)
elif new_engine not in idx:
    raise SystemExit('Engine VERSION baseline mismatch')

marker = "test('CEO v1.1 blocks early-leading FT AH before minute 60'"
if marker not in test:
    test += r'''

test('CEO v1.1 blocks early-leading FT AH before minute 60',()=>{
  const history=[
    snap(t0,40,{gH:1,gA:0}),
    snap(t0+5*60_000,45,{sotH:1,soffH:2,cH:1,aH:16,aA:7,dH:9,dA:3,pH:62,pA:38,gH:1,gA:0}),
    snap(t0+10*60_000,50,{sotH:3,soffH:5,cH:3,aH:35,aA:13,dH:21,dA:6,pH:65,pA:35,gH:1,gA:0})
  ];
  const rows=ceoCandidatesForFixture({fixtureId:'EARLY-LEAD',minute:50,goals:{home:1,away:0},events:[]},history,['ft_ah']);
  assert.deepEqual(rows,[]);
});

test('CEO v1.1 may evaluate a leading FT AH side from minute 60 onward',()=>{
  const rows=ceoCandidatesForFixture({fixtureId:'LATE-LEAD',minute:60,goals:{home:1,away:0},events:[]},strongHomeHistory,['ft_ah']);
  assert.equal(rows.length,1);
  assert.equal(rows[0].selection,'HOME');
  assert.equal(rows[0].strategyVersion,'1.1');
});

test('CEO v1.1 caps FT live AH at plus/minus 0.5 without tightening other AH markets',()=>{
  assert.equal(CEO_PRICE_SETTINGS.ft_ah.lineMin,-0.5);
  assert.equal(CEO_PRICE_SETTINGS.ft_ah.lineMax,0.5);
  const ft={strategy:'CEO',market:'ft_ah',ceoScore:82,price:{line:-0.75,odds:1.88},referee:{validOffers:4,consensusOffers:3,agreementPct:75,offers:[{line:-0.75,odds:1.84},{line:-0.75,odds:1.86},{line:-0.75,odds:1.88}]}};
  assert.equal(ceoPostPricePass(ft).pass,false);
  assert.equal(ceoPostPricePass(ft).reason,'LINE_RISK');
  const ht={...ft,market:'ht_ah',price:{line:-1,odds:1.88},referee:{validOffers:3,consensusOffers:3,agreementPct:100,offers:[{line:-1,odds:1.84},{line:-1,odds:1.86},{line:-1,odds:1.88}]}};
  assert.equal(ceoPostPricePass(ht).pass,true);
});
'''

CEO.write_text(ceo)
INDEX.write_text(idx)
TEST.write_text(test)
print('CEO_AH_V11_PATCH_READY')
