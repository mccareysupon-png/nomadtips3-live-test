from pathlib import Path
import re

REV='343-signal-ceo-detail-v1'
js_path=Path('nomad-live-343/signal-next.js')
html_path=Path('nomad-live-343/signal.html')

s=js_path.read_text()
if REV in s:
    raise SystemExit('CEO_SIGNAL_UI_ALREADY_PATCHED')

needle="const POLL=30000;"
if needle not in s:
    raise SystemExit('SIGNAL_POLL_ANCHOR_MISSING')
s=s.replace(needle,needle+f"\nconst UI_REVISION='{REV}';",1)

team_anchor="const team=(s,side)=>s?.[side]?.name||side.toUpperCase();\n"
if team_anchor not in s:
    raise SystemExit('TEAM_ANCHOR_MISSING')
helpers=r'''const isCeo=s=>String(s?.strategy||'').toUpperCase()==='CEO';
const ceoRows=g=>(Array.isArray(g?.signals)?g.signals:[]).filter(isCeo);
const ownerRows=g=>(Array.isArray(g?.signals)?g.signals:[]).filter(s=>!isCeo(s));
function ceoSignal(g){return ceoRows(g).slice().sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0))[0]||null}
function ownerSignal(g){return ownerRows(g).slice().sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0))[0]||null}
const CEO_REASON_LABELS={PRESSURE_EDGE:'Pressure Edge',EVENT_EVIDENCE:'Event Evidence',TREND_SUPPORT:'Trend Support',SHORT_PRESSURE:'Short Pressure',TEMPO_ACTIVE:'Active Tempo',PRIMARY_EVENT:'Primary Event',TREND_STABLE:'Trend Stable',TREND_SHIFT:'Trend Shift',LOW_TEMPO:'Low Tempo',LOW_EVENT_RATE:'Low Event Rate',TREND_CONTROL:'Trend Control',BOTH_SIDES_ACTIVE:'Both Sides Active',BOTH_SIDES_SOT:'Both Sides SOT',BALANCED_THREAT:'Balanced Threat',ONE_SIDE_SUPPRESSED:'One Side Suppressed',NO_RECENT_SOT:'No Recent SOT',PRESSURE_IMBALANCE:'Pressure Imbalance',CARD_RATE_EDGE:'Card Rate Edge',CARD_IMBALANCE:'Card Imbalance'};
function ceoReasonLabel(v){const k=String(v||'').toUpperCase();return CEO_REASON_LABELS[k]||k.toLowerCase().replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
function fmtMetric(v,suffix=''){const n=num(v);return n===null?'—':`${Math.round(n*10)/10}${suffix}`}
function strategyBadge(g){const rows=ceoRows(g);if(!rows.length)return'';const v=rows[0]?.strategyVersion||'1.0',dual=ownerRows(g).length>0,count=rows.length>1?` · ${rows.length} CEO`:'';return`<div class="ceo-strategy-row"><span class="ceo-strategy-badge">CEO · ADD K${esc(count)}</span><span class="ceo-version">v${esc(v)}</span>${dual?'<span class="ceo-dual">OWNER + CEO</span>':''}</div>`}
function ceoDecision(g){
  const s=ceoSignal(g);if(!s)return'';
  const r=s?.referee||{},gate=s?.ceoPriceGate||{},scoreVal=num(s?.ceoScore),need=num(gate?.scoreNeed),valid=num(r?.validOffers),consensus=num(r?.consensusOffers),available=num(r?.availableBookmakers),agree=num(r?.agreementPct),median=num(gate?.medianOdds),best=num(r?.selectedOdds??s?.odds),version=s?.strategyVersion||'1.0';
  const raw=[...(Array.isArray(s?.ceoReasonCodes)?s.ceoReasonCodes:[]),...(Array.isArray(s?.evidence?.reasonCodes)?s.evidence.reasonCodes:[])];
  if(String(gate?.reason||'').toUpperCase()==='CEO_PASS')raw.push('REFEREE_CONSENSUS','PRICE_SCORE_FIT','NO_PRICE_OUTLIER');
  const extra={REFEREE_CONSENSUS:'Referee Consensus',PRICE_SCORE_FIT:'Price / Score Fit',NO_PRICE_OUTLIER:'No Price Outlier'};
  const reasons=[...new Set(raw.filter(Boolean))].map(x=>extra[String(x).toUpperCase()]||ceoReasonLabel(x));
  const minute=entryMinute(s),book=s?.bookmaker||r?.selectedBookmaker||'—';
  return`<div class="ceo-decision"><div class="ceo-decision-head"><span>CEO AUTO · ADD K</span><strong>v${esc(version)} · Official Signal</strong></div><div class="ceo-score-wrap"><div class="ceo-score-box"><small>CEO SCORE</small><strong>${esc(scoreVal===null?'—':Math.round(scoreVal*10)/10)}</strong><em>Decision score · not win probability</em></div><div class="ceo-gate"><div class="ceo-metric pass"><span>STATUS</span><strong>PASS</strong></div><div class="ceo-metric"><span>REQUIRED AT PRICE</span><strong>${esc(need===null?'—':Math.round(need*10)/10)}</strong></div><div class="ceo-metric"><span>MARKET</span><strong>${esc(s?.marketLabel||s?.market||'—')}</strong></div><div class="ceo-metric"><span>LINE</span><strong>${esc(lineText(s))}</strong></div></div></div><div class="ceo-referee"><div class="ceo-metric"><span>BOOKS AVAILABLE</span><strong>${esc(show(available))}</strong></div><div class="ceo-metric"><span>REFEREE</span><strong>${esc(show(consensus))}/${esc(show(valid))}</strong></div><div class="ceo-metric"><span>AGREEMENT</span><strong>${esc(agree===null?'—':`${Math.round(agree*10)/10}%`)}</strong></div><div class="ceo-metric"><span>MARKET MEDIAN</span><strong>${esc(median===null?'—':Math.round(median*100)/100)}</strong></div><div class="ceo-metric pass"><span>BEST PRICE</span><strong>@ ${esc(best===null?show(s?.odds):Math.round(best*1000)/1000)}</strong></div><div class="ceo-metric"><span>BOOKMAKER</span><strong>${esc(book)}</strong></div></div><div class="ceo-reasons">${reasons.length?reasons.map(x=>`<span class="ceo-reason">${esc(x)}</span>`).join(''):'<span class="ceo-reason">CEO Auto Gate Passed</span>'}</div><div class="ceo-lock">Signal locked at ${esc(show(minute))}${minute==null?'':"'"} · Score ${esc(entryScore(s))} · Strategy CEO v${esc(version)}</div></div>`
}
'''
s=s.replace(team_anchor,team_anchor+helpers,1)

new_detail=r'''function detail(g){const s=g.sample,m=entryMinute(s),league=[s?.league?.country,s?.league?.name].filter(Boolean).join(' · '),ceo=ceoSignal(g),owner=ownerSignal(g);const right=ceo?`${ceoDecision(g)}${owner?`<div class="ceo-owner-block"><h4>OWNER CONDITIONS · SAME MATCH</h4>${evidence(owner)}</div>`:''}`:evidence(s),title=ceo?'CEO Decision · Add K':'Why this signal';return`<div class="next-signal-detail"><div class="next-detail-grid"><section class="next-detail-card"><h3>Live match statistics</h3>${statRows(s)}${flowCard(g)}</section><section class="next-detail-card"><h3>${title}</h3>${right}</section></div><div class="next-detail-meta"><div class="next-meta"><span>SIGNAL AT</span><strong>${esc(show(m))}${m==null?'':"'"} · ${esc(entryScore(s))}</strong></div><div class="next-meta"><span>LIVE NOW</span><strong>${esc(liveMinute(s))} · ${esc(liveScore(s))}</strong></div><div class="next-meta"><span>LEAGUE</span><strong>${esc(league||'—')}</strong></div><div class="next-meta"><span>ACTIVE SIGNALS</span><strong>${g.signals.length}</strong></div></div></div>`}
'''
pat=r"function detail\(g\)\{.*?\}\nfunction marketPrimary"
s,n=re.subn(pat,new_detail+"function marketPrimary",s,count=1,flags=re.S)
if n!=1:
    raise SystemExit('DETAIL_FUNCTION_PATCH_FAILED')

new_market=r'''function marketPrimary(g){const s=g.signals[0];const extra=g.signals.length>1?` +${g.signals.length-1}`:'';return`<div class="next-market"><small>PRIMARY SIGNAL${extra}</small><div class="next-market-line"><span class="next-market-name">${esc(s?.marketLabel||s?.market||'—')}</span><span class="next-pick">${esc(pickText(s))}</span><span class="next-price">@ ${esc(show(s?.odds))}</span></div><div class="next-book">${esc(s?.bookmaker||'Bet365')}${extra?` · ${esc(extra)} more active signal${g.signals.length>2?'s':''}`:''}</div>${strategyBadge(g)}</div>`}
'''
pat2=r"function marketPrimary\(g\)\{.*?\}\nfunction card"
s,n=re.subn(pat2,new_market+"function card",s,count=1,flags=re.S)
if n!=1:
    raise SystemExit('MARKET_PRIMARY_PATCH_FAILED')

js_path.write_text(s)

h=html_path.read_text()
if 'ceo-signal-detail.css' not in h:
    css_anchor='<link rel="stylesheet" href="content-rails-343.css?v=343-content-rails-v1">'
    if css_anchor not in h:
        raise SystemExit('SIGNAL_CSS_ANCHOR_MISSING')
    h=h.replace(css_anchor,css_anchor+f'\n<link rel="stylesheet" href="ceo-signal-detail.css?v={REV}">',1)
h,n=re.subn(r'signal-next\.js\?v=[^"&]+',f'signal-next.js?v={REV}',h,count=1)
if n!=1:
    raise SystemExit('SIGNAL_SCRIPT_LOADER_MISSING')
html_path.write_text(h)
print('CEO_SIGNAL_UI_PATCH_PASS')
