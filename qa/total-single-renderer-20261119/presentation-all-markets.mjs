import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'ANCHOR_DRIFT '+a.slice(0,100));return s.replace(a,b)};
const numPattern=/^([\d,]+)\s*·\s*([\d,]+)\s*·\s*([\d,]+)$/;
export const wdlCSS=String.raw`
/* Stats-only presentation; no result keys, layout, calculation or network changes. */
body[data-workspace-view="statistics"] {--b46-wdl-win:#37d49a;--b46-wdl-draw:#e6bc71;--b46-wdl-loss:#ff6779}
html:not([data-theme="dark"]) body[data-workspace-view="statistics"] {--b46-wdl-win:#087c50;--b46-wdl-draw:#87570a;--b46-wdl-loss:#c73649}
body[data-workspace-view="statistics"] [data-b46-wdl="win"] {color:var(--b46-wdl-win)!important}
body[data-workspace-view="statistics"] [data-b46-wdl="draw"] {color:var(--b46-wdl-draw)!important}
body[data-workspace-view="statistics"] [data-b46-wdl="loss"] {color:var(--b46-wdl-loss)!important}
body[data-workspace-view="statistics"] [data-b46-wdl] {display:inline!important;font:inherit!important;letter-spacing:inherit!important;white-space:nowrap}
body[data-workspace-view="statistics"] :is(.b46-stage-outcomes-segment,.b46-stage-outcomes-legend-dot,.b46-v1-market-track>span,.b46-fast-outcomes-track>span)[data-result="win"],
body[data-workspace-view="statistics"] .b46-stage-outcomes-legend-item[data-result="win"] i {background:var(--b46-wdl-win)!important}
body[data-workspace-view="statistics"] :is(.b46-stage-outcomes-segment,.b46-stage-outcomes-legend-dot,.b46-v1-market-track>span,.b46-fast-outcomes-track>span)[data-result="push"],
body[data-workspace-view="statistics"] .b46-stage-outcomes-legend-item[data-result="push"] i {background:var(--b46-wdl-draw)!important}
body[data-workspace-view="statistics"] :is(.b46-stage-outcomes-segment,.b46-stage-outcomes-legend-dot,.b46-v1-market-track>span,.b46-fast-outcomes-track>span)[data-result="loss"],
body[data-workspace-view="statistics"] .b46-stage-outcomes-legend-item[data-result="loss"] i {background:var(--b46-wdl-loss)!important}
`;
const domHelper=String.raw`function b46WdlText(el,value){
 const m=String(value).match(/^([\d,]+)\s*·\s*([\d,]+)\s*·\s*([\d,]+)$/);
 if(!m){el.textContent=value;return}
 const f=document.createDocumentFragment();
 ['win','draw','loss'].forEach((k,i)=>{if(i)f.append(' · ');const span=document.createElement('span');span.dataset.b46Wdl=k;span.textContent=m[i+1];f.append(span)});
 el.replaceChildren(f);
}
`;
const markup=String.raw`function b46WdlMarkup(v){const m=String(v).match(/^([\d,]+)\s*·\s*([\d,]+)\s*·\s*([\d,]+)$/);return m?['win','draw','loss'].map((k,i)=>'<span data-b46-wdl="'+k+'">'+esc(m[i+1])+'</span>').join(' · '):esc(v)}
`;
export function patchAll({finance,visual,fast,columns,html}){
 assert.equal(sha(finance),'98b2ee71e447acc4e4128fb042a8ddd1d3eb4a86948cfe346d054cb9f7d54000','FINANCE_TEST_DRIFT');
 assert.equal(sha(visual),'22aceda83f92a736b9888fb374803a3c241cc746b8cf1ea6c1a2c4909f12698e','VISUAL_TEST_DRIFT');
 assert.equal(sha(fast),'503e6a05298d8e9abf2b3710601dab228b95d4db07701b802d02f6c4a8bb913b','FAST_SOURCE_DRIFT');
 assert.equal(sha(columns),'413437e50211b7debaadb3d474eef3d8c1db8733557c816dd9422787432d4ada','COLUMNS_SOURCE_DRIFT');
 finance=once(finance,'function b46TotalMarkup(s,rate){',markup+'function b46TotalMarkup(s,rate){');
 finance=once(finance,"['push','Push',s.pushes]","['push','DRAW',s.pushes]");
 finance=once(finance,"['W · P · L','wpl',","['W · D · L','wpl',");
 finance=once(finance,"['STAKE','stake',","['UNITS USED','stake',");
 finance=once(finance,"<strong class=\"b46-stage-summary-number\">'+esc(v)+'</strong>","<strong class=\"b46-stage-summary-number\">'+(k==='wpl'?b46WdlMarkup(v):esc(v))+'</strong>");
 // Rename the hidden native label consumed by stage and filtered-market renderers; adapt both readers below.
 finance=once(finance,"['W · P · L',s.wins","['W · D · L',s.wins");
 finance=once(finance,"['STAKE',s.stake","['UNITS USED',s.stake");
 finance=once(finance,"'Net ÷ stake'","'Net ÷ units used'");
 finance=once(finance,'<span>Stake <b>','<span>UNITS USED <b>');
 visual=once(visual,"['W · P · L','wpl']","['W · D · L','wpl']");
 visual=once(visual,"['STAKE','stake']","['UNITS USED','stake']");
 visual=once(visual,'  function sync(){',domHelper+'  function sync(){');
 visual=once(visual,'const source=available.get(label);',"const source=available.get(label)||available.get(label==='W · D · L'?'W · P · L':label==='UNITS USED'?'STAKE':label);");
 visual=once(visual,"const raw=available.get(label)?.querySelector", "const raw=(available.get(label)||available.get(label==='PUSH'?'DRAW':label))?.querySelector");
 visual=once(visual,'outcomes.push({key,label,count});',"outcomes.push({key,label:key==='push'?'DRAW':label,count});");
 visual=once(visual,'value.textContent=entry.value;', "if(entry.key==='wpl')b46WdlText(value,entry.value);else value.textContent=entry.value;");
 visual=once(visual,"key.textContent=outcome.label.charAt(0)+outcome.label.slice(1).toLowerCase();","key.textContent=outcome.key==='push'?'DRAW':outcome.label.charAt(0)+outcome.label.slice(1).toLowerCase();");
 fast=once(fast,'function enhanceFilteredMarket(){',domHelper+'function enhanceFilteredMarket(){');
 fast=once(fast,"getValue.get('W · P · L'),stake=getValue.get('STAKE')","(getValue.get('W · D · L')||getValue.get('W · P · L')),stake=(getValue.get('UNITS USED')||getValue.get('STAKE'))");
 fast=once(fast,"[['stake','STAKE',stake],['drawdown','MAX DRAWDOWN',maxDD],['wpl','W · P · L',wpl]]","[['stake','UNITS USED',stake],['drawdown','MAX DRAWDOWN',maxDD],['wpl','W · D · L',wpl]]");
 fast=once(fast,"item.textContent=result.toUpperCase()+' '","item.textContent=(result==='push'?'DRAW':result.toUpperCase())+' '");
 fast=once(fast,"item.textContent=key.toUpperCase()+' '","item.textContent=(key==='push'?'DRAW':key.toUpperCase())+' '");
 fast=once(fast,"['W · P · L','wpl',[w,p,l]","['W · D · L','wpl',[w,p,l]");
 fast=once(fast,"['STAKE','stake',fmt(graph.summary.stake","['UNITS USED','stake',fmt(graph.summary.stake");
 assert.equal(fast.split("const strong=document.createElement('b');strong.textContent=value;").length,3);
 fast=fast.replaceAll("const strong=document.createElement('b');strong.textContent=value;","const strong=document.createElement('b');if(key==='wpl')b46WdlText(strong,value);else strong.textContent=value;");
 columns=once(columns,"state=c.settled?c.res:type===","state=c.settled?(c.res==='PUSH'?'DRAW':c.res):type===");
 // Stats-only original KPI label and v23 native strip, not live view, not backend.
 html=once(html,'<span>PUSH</span><strong data-sp-kpi="push">','<span>DRAW</span><strong data-sp-kpi="push">');
 html=once(html,'<small>Push excluded</small>','<small>Draw excluded</small>');
 html=once(html,"else if(['UNSETTLED','PUSH'].includes(label))","else if(['UNSETTLED','PUSH','DRAW'].includes(label))");
 html=once(html,'/^(PENDING|UNSETTLED|PUSH)$/.test(text)','/^(PENDING|UNSETTLED|PUSH|DRAW)$/.test(text)');
 html=once(html,"function makeCard(item){\n",domHelper+"function makeCard(item){\n");
 html=once(html,"for(let j=0;j<3;j++)if(children[j].textContent!==vals[j])children[j].textContent=vals[j];","for(let j=0;j<3;j++)if(children[j].textContent!==vals[j]||(j===1&&it.label==='W · D · L'&&!children[j].querySelector('[data-b46-wdl]'))){if(j===1&&it.label==='W · D · L')b46WdlText(children[j],vals[j]);else children[j].textContent=vals[j];}");
 return {finance,visual,fast,columns,html};
}
