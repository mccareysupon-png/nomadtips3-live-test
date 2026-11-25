export const MARK='B46_ADAPTIVE_CONTROL_WLD_TOTALS_20261125';
function once(s,oldText,newText,label){if(s.split(oldText).length!==2)throw Error('WLD_UI_DRIFT_'+label);return s.replace(oldText,newText);}
export function patchControlPage(html){
 if(html.includes(MARK))throw Error('WLD_ALREADY_DEPLOYED');
 let out=once(html,'<div id="kpis" class="grid4"></div>',
 '<div id="kpis" class="grid4"></div>\n<section class="card" id="b46-wld-totals" aria-label="ผลรวม Win Loss Draw ทุกสูตร"><h2>ผลรวม Win / Loss / Draw · ทุก 42 สูตร</h2><div id="b46-wld-totals-body" class="grid4" aria-live="polite"></div><p class="sub">รวมผลการทำนายแยกตามสูตร (นับหนึ่งครั้งต่อผลตัดสินของแต่ละสูตร) ไม่ใช่จำนวนคู่ฟุตบอลไม่ซ้ำกัน · DRAW สำหรับตลาด O/U 2.5 เท่ากับ 0 เพราะไม่มีผลเดิมพันเสมอ · PENDING ไม่รวมใน Win Rate</p></section>','TOTALS_CONTAINER');
 const helper=`// B46_ADAPTIVE_CONTROL_WLD_TOTALS_20261125
function showWldTotals(all){
 var totals={wins:0,losses:0,draws:0,pending:0};
 for(var i=0;i<all.length;i++){
  var f=all[i];
  for(var key of ['wins','losses','draws','pending']){
   var n=f[key]==null?0:Number(f[key]);
   if(!Number.isSafeInteger(n)||n<0)throw Error('INVALID_WLD_FORMULA_COUNT_'+String(f.formula)+'_'+key);
   totals[key]+=n;
  }
 }
 var settled=totals.wins+totals.losses+totals.draws;
 var allSignals=settled+totals.pending;
 var pct=(totals.wins+totals.losses)?100*totals.wins/(totals.wins+totals.losses):null;
 var cards=[['WIN',totals.wins,'positive'],['LOSS',totals.losses,'negative'],['DRAW',totals.draws,''],['SETTLED',settled,''],['PENDING',totals.pending,''],['ALL RESULTS',allSignals,''],['WIN RATE',pct==null?'—':pct.toFixed(2)+'%','positive'],['FORMULAS',all.length,'']];
 by('b46-wld-totals-body').innerHTML=cards.map(function(c){
  return '<div class="latest-item"><small>'+c[0]+'</small><strong class="nums '+c[2]+'">'+c[1]+'</strong></div>';
 }).join('');
 window.__B46_WLD_TOTALS_READONLY={...totals,settled:settled,allResults:allSignals,winRate:pct,formulaCount:all.length};
}
`;
 out=once(out,'function draw(){\n if(!data)return;',''+helper+'function draw(){\n if(!data)return;','JS_HELPER');
 out=once(out,' showLatest();\n var ss=data.summary;',' showLatest();\n showWldTotals(data.formulas);\n var ss=data.summary;','INVOKE');
 return out;
}
export function patchSource(source){
 const match=source.match(/^export const adaptiveControlHtml = (".*");\s*$/s);
 if(!match)throw Error('CONTROL_MODULE_EXPORT_DRIFT');
 const html=JSON.parse(match[1]),patched=patchControlPage(html);
 const newSource='export const adaptiveControlHtml = '+JSON.stringify(patched)+';\n';
 return {html:patched,module:newSource,previous:html};
}
