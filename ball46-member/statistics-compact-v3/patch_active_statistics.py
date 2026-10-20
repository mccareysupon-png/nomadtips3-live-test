#!/usr/bin/env python3
"""Patch only the existing Member renderSummary() and desktop-only #dailySummary CSS from current production bytes."""
import hashlib, pathlib, sys, json
MARK="BALL46_MEMBER_DESKTOP_STATISTICS_COMPACT_V3_20261020"
def digest(raw):return hashlib.sha256(raw).hexdigest()
def patch(js,css):
    assert MARK not in js and MARK not in css, "ALREADY_PATCHED"
    assert len(js)>75000 and len(css)>200000, "ACTIVE_ASSET_SIZE_UNEXPECTED"
    start=js.index("function renderSummary(){")
    end=js.index("\nfunction filteredRows(){",start)
    original=js[start:end]
    assert original.count("const items=[")==1, "SUMMARY_ARRAY_DRIFT"
    assert original.count("summary.replaceChildren();")==1, "SUMMARY_RENDER_DRIFT"
    assert original.count("['HALF WIN',s.halfWin,'half-win']")==1, "HALF_WIN_SOURCE_DRIFT"
    assert original.count("['HALF LOSS',s.halfLoss,'half-loss']")==1, "HALF_LOSS_SOURCE_DRIFT"
    assert original.count("['AVG ODDS',avgOdds===null?'—':avgOdds.toFixed(2),'mobile-avg-odds']")==1, "REAL_AVG_ODDS_SOURCE_DRIFT"
    assert original.count("  const pnlKind=s.pnl>0?'pos':s.pnl<0?'neg':'neutral';")==1,"PNL_KIND_DRIFT"
    desktop_items="""  // Desktop V3 only: 9 compact KPI cards in a single row. Mobile V6 unchanged.
  const desktopKpi=window.matchMedia('(min-width:768px)').matches;
  const pnlKind=s.pnl>0?'pos':s.pnl<0?'neg':'neutral';
  const items=desktopKpi?[
    ['SIGNALS',s.signals,'signals'],
    ['WIN',(Number(s.win)||0)+(Number(s.halfWin)||0),'win'],
    ['LOSS',(Number(s.loss)||0)+(Number(s.halfLoss)||0),'loss'],
    ['PUSH',s.push,'push'],
    ['PENDING',s.pending,'pending'],
    ['LIVE',s.live||0,'live'],
    ['WIN RATE',fmtPct(s.winRate),rateClass],
    ['P/L TODAY',fmtPnl(s.pnl),'pnl-card '+pnlKind],
    ['AVG ODDS',avgOdds===null?'—':avgOdds.toFixed(2),'desktop-avg-odds']
  ]:[
"""
    updated=original.replace("  const items=[\n",desktop_items,1)
    tail="""  const pnlKind=s.pnl>0?'pos':s.pnl<0?'neg':'neutral';
  const pnlBox=node('div','stat summary-stat pnl-card '+pnlKind);
  pnlBox.append(node('span','','P/L TODAY'),node('b','pnl '+pnlKind,fmtPnl(s.pnl)));
  summary.append(pnlBox);
"""
    assert updated.count(tail)==1,"PNL_APPENDER_DRIFT"
    updated=updated.replace(tail,"  if(!desktopKpi){\n"+tail.replace("  const pnlKind=s.pnl>0?'pos':s.pnl<0?'neg':'neutral';\n","").replace("  ","    ",1).replace("\n  ","\n    ")+ "  }\n",1)
    assert updated.count("['SIGNALS',s.signals,'signals']")==2,"MOBILE_ITEMS_NOT_PRESERVED"
    assert updated.count("['HALF WIN',s.halfWin,'half-win']")==1,"MOBILE_HALF_WINS_AFFECTED"
    assert updated.count("['HALF LOSS',s.halfLoss,'half-loss']")==1,"MOBILE_HALF_LOSSES_AFFECTED"
    assert updated.count("desktop-avg-odds")==1
    jsNew=js[:start]+"// "+MARK+"\n"+updated+js[end:]
    # Avoid change of Ledger/statistical algorithms or other functions, strict single-block edit.
    assert jsNew.replace("// "+MARK+"\n"+updated,original,1)==js
    newCss="""
/* BALL46_MEMBER_DESKTOP_STATISTICS_COMPACT_V3_20261020
   PC/Laptop only >=768px. Existing Mobile V6 untouched. */
@media(min-width:768px){
  .page-member #dailySummary{
    display:grid!important;
    grid-template-columns:repeat(9,minmax(0,1fr))!important;
    gap:clamp(3px,.55vw,7px)!important;
    min-width:0!important;
    width:100%!important;
    max-width:100%!important;
  }
  .page-member #dailySummary .summary-stat{
    box-sizing:border-box!important;
    width:auto!important;
    min-width:0!important;
    height:60px!important;
    min-height:60px!important;
    max-height:60px!important;
    padding:6px 2px!important;
    gap:2px!important;
    overflow:hidden;
    justify-content:center;
  }
  .page-member #dailySummary .summary-stat span{
    width:100%;
    max-width:100%;
    font-size:clamp(7px,.65vw,9px)!important;
    line-height:1.1!important;
    letter-spacing:0!important;
    white-space:nowrap!important;
    overflow:hidden;
    text-overflow:clip;
  }
  .page-member #dailySummary .summary-stat b{
    width:100%;
    max-width:100%;
    font-size:clamp(11px,1vw,15px)!important;
    line-height:1.12!important;
    font-variant-numeric:tabular-nums;
    white-space:nowrap!important;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .page-member #dailySummary .summary-stat.desktop-avg-odds span{color:#99bbcf}
  .page-member #dailySummary .summary-stat.desktop-avg-odds b{color:#a9e1fc}
}
"""
    assert "@media(min-width:768px)" in newCss
    return jsNew,css+"\n"+newCss

def main():
    assert len(sys.argv)==6,"usage: patch_active_statistics.py original-member.js original-styles.css candidate-member.js candidate-styles.css report.json"
    jsf,cssf,outjs,outcss,reportfile=map(pathlib.Path,sys.argv[1:])
    jsraw=jsf.read_bytes();cssraw=cssf.read_bytes()
    newjs,newcss=patch(jsraw.decode(),cssraw.decode())
    outjs.parent.mkdir(parents=True,exist_ok=True)
    outcss.parent.mkdir(parents=True,exist_ok=True)
    outjs.write_bytes(newjs.encode())
    outcss.write_bytes(newcss.encode())
    report={'before':{'member.js':digest(jsraw),'styles.css':digest(cssraw)},
            'after':{'member.js':digest(newjs.encode()),'styles.css':digest(newcss.encode())},
            'onlyChangedAssets':['/member.js','/styles.css'],'mobilePreserved':True,
            'description':'9 desktop KPI cards, WIN and LOSS include HALF respective counts, ledger untouched'}
    reportfile.write_text(json.dumps(report,indent=2),encoding='utf8')
    print('MEMBER_STATISTICS_V3_PATCH_READY',json.dumps(report))

if __name__=='__main__':main()
