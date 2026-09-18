from pathlib import Path
p=Path('workers/nomadtips3-engine-343/src/index-bulk.js')
s=p.read_text()
old="if(!f){f=(hub.fixtures||[]).find(x=>isLive(x)&&oddsRoot(x.providerOdds));fixtureId=String(f?.fixtureId??'')}"
new="""if(!f){
        const wantLine=MARKET_RULES[key]?.kind==='AH'||MARKET_RULES[key]?.kind==='OU';
        f=(hub.fixtures||[]).find(x=>{
          if(!isLive(x))return false;
          const r=oddsRoot(x.providerOdds);if(!r)return false;
          if(!wantLine)return true;
          const p=priceFor(r,key,selection);
          return p?.providerLine!==null&&p?.providerLine!==undefined;
        });
        fixtureId=String(f?.fixtureId??'')
      }"""
if old in s:
    s=s.replace(old,new,1)
elif 'const wantLine=MARKET_RULES[key]?.kind' not in s:
    raise SystemExit('canary selector anchor missing')
p.write_text(s)
print('canary selector ready')
