import { inspect, literals } from '../../deploy-assets/match-status-svg-20261003/production.mjs';
const current=await inspect();
const css=literals(current.source).get('__B46_SCOREBAR_TUNE_CSS__');
if(!css) throw new Error('PRESENTATION_CSS_LITERAL_MISSING');
const text=css.value;
const lines=text.split(/\n/);
const needles=['match','card','board','fixture','row','theme','dark','light','data-theme','signal-inline','prediction-live'];
const out=[];
for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(needles.some(n=>line.toLowerCase().includes(n))){
    const start=Math.max(0,i-2), end=Math.min(lines.length,i+4);
    out.push({line:i+1,snippet:lines.slice(start,end).join('\n')});
  }
}
console.log(JSON.stringify({version:current.restore.version,cssSha:current.restore.presentationCssSha,bytes:Buffer.byteLength(text),hits:out.slice(0,140)},null,2));
console.log('MATCH_CARD_THEME_SCOUT_PASS');