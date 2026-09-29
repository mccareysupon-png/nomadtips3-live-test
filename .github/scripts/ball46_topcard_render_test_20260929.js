const fs=require('fs');
const src=fs.readFileSync('ball46-topcard-candidate-20260929/dashboard-v2-stage3.js','utf8');
function extractFunction(source,name){
 const needle=`function ${name}(`, s=source.indexOf(needle); if(s<0)throw new Error('missing '+name);
 const b=source.indexOf('{',s); let depth=0,quote=null,escp=false;
 for(let i=b;i<source.length;i++){const c=source[i]; if(quote){if(escp)escp=false;else if(c==='\\')escp=true;else if(c===quote)quote=null;}else{if(c==='"'||c==="'"||c==='`')quote=c;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(s,i+1);}}
 throw new Error('unbalanced');
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
const show=(v,d=0)=>{const n=num(v);if(n===null)return'—';return d?String(Number(n.toFixed(d))):String(n)};
const pair=v=>{if(!v||typeof v!=='object')return{home:null,away:null};return{home:num(v.home),away:num(v.away)}};
let signalRows=[],settledSignalRows=[];
const slot={innerHTML:''};
const document={querySelector:s=>s==='[data-workspace-scorebar-slot]'?slot:null};
eval(extractFunction(src,'renderWorkspaceScorebar'));
function team(home,away){return{home:{name:home},away:{name:away}}}
settledSignalRows=[
 {...team('Corner Home','Corner Away'),status:'SETTLED',result:'WIN',providerMarket:'corner',market:'ft_corner_over',marketLabel:'Corners OVER · Full Time',selection:'OVER',line:9.5,odds:1.575,entryMinute:88,entryScore:{home:0,away:1},entryCorners:{home:3,away:6},finalScore:{home:0,away:1},finalCorners:{home:3,away:7},createdAt:4},
 {...team('AH Home','AH Away'),status:'SETTLED',result:'PUSH',providerMarket:'asian',market:'ft_ah',marketLabel:'Asian Handicap · Full Time',selection:'AWAY',line:0,odds:1.675,entryMinute:75,entryScore:{home:0,away:1},finalScore:{home:0,away:1},createdAt:3},
 {...team('Goals Home','Goals Away'),status:'SETTLED',result:'WIN',providerMarket:'goalline',market:'ft_under',marketLabel:'Goals UNDER · Full Time',selection:'UNDER',line:1.75,odds:1.6,entryMinute:71,entryScore:{home:0,away:1},finalScore:{home:0,away:1},createdAt:2},
 {...team('1X2 Home','1X2 Away'),status:'SETTLED',result:'LOSS',providerMarket:'1x2',market:'ft_1x2',marketLabel:'1X2 · Full Time',selection:'HOME',line:null,odds:1.909,entryMinute:72,entryScore:{home:2,away:2},finalScore:{home:2,away:2},createdAt:1}
];
signalRows=[
 {...team('Live Corner Home','Live Corner Away'),status:'PENDING',providerMarket:'corner',market:'ft_corner_over',marketLabel:'Corners OVER · Full Time',selection:'OVER',line:13.5,odds:1.6,entryMinute:84,mirrorMinute:86,entryScore:{home:0,away:5},mirrorScore:{home:0,away:5},entryCorners:{home:7,away:6},liveCorners:{home:7,away:7},createdAt:8},
 {...team('Live Goals Home','Live Goals Away'),status:'PENDING',providerMarket:'goalline',market:'ft_under',marketLabel:'Goals UNDER · Full Time',selection:'UNDER',line:2.5,odds:1.5,entryMinute:80,mirrorMinute:92,entryScore:{home:2,away:0},mirrorScore:{home:2,away:1},createdAt:7},
 {...team('Live 1X2 Home','Live 1X2 Away'),status:'PENDING',providerMarket:'1x2',market:'ft_1x2',marketLabel:'1X2 · Full Time',selection:'AWAY',odds:1.615,entryMinute:35,minute:35,entryScore:{home:0,away:1},mirrorScore:{home:0,away:1},createdAt:6},
 {...team('Live AH Home','Live AH Away'),status:'PENDING',providerMarket:'asian',market:'ft_ah',marketLabel:'Asian Handicap · Full Time',selection:'HOME',line:-0.5,odds:1.9,entryMinute:61,mirrorMinute:67,entryScore:{home:1,away:1},mirrorScore:{home:2,away:1},createdAt:5}
];
renderWorkspaceScorebar();
const out=slot.innerHTML;
const must=[
 'ENTRY</i><b>C 9 (3–6)</b>','title="Entry minute">88&#39;</span>','<i>FT</i><b>C 10 (3–7)</b>',
 'ENTRY</i><b>0–1</b>','title="Entry minute">75&#39;</span>','<i>FT</i><b>0–1</b>',
 'ENTRY</i><b>C 13 (7–6)</b>','title="Entry minute">84&#39;</span>','<i>NOW</i><b>C 14 (7–7)</b>',
 'ENTRY</i><b>2–0</b>','title="Entry minute">80&#39;</span>','<i>NOW</i><b>2–1</b>',
 'PENDING · 86&#39;','0–5'
];
for(const x of must){if(!out.includes(x)){console.error('MISSING',x);console.error(out);process.exit(1)}}
const details=(out.match(/data-scorebar-details="1"/g)||[]).length;
if(details!==8)throw new Error('expected 8 populated detail rows, got '+details);
if(!out.includes('workspace-scorebar-grid'))throw new Error('grid missing');
console.log('RENDER_TEST_OK details='+details);
console.log(out.replace(/></g,'>\n<'));
