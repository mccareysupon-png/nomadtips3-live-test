const fs=require('fs');
const [,,srcPath,outPath]=process.argv;
if(!srcPath||!outPath)throw new Error('USAGE: node patch-dashboard-v2-tune-20261004.js <src> <out>');
let s=fs.readFileSync(srcPath,'utf8');
const MARK='B46_TOPCARDS_CLEAN_UI_20261004';
if(s.includes(MARK))throw new Error('TOPCARDS_CLEAN_UI_ALREADY_PRESENT');
for(const anchor of ['.workspace-scorebar-grid','.workspace-scorebar-cell','scorebar-win-20261002c.webp']){
  if(!s.includes(anchor))throw new Error('EXPECTED_SCOREBAR_ANCHOR_MISSING:'+anchor);
}
const css=`

/* ${MARK}: presentation-only redesign for the 6 settled + 4 pending scorebar cards. No data, polling, status, settlement, or workspace behavior changes. */
.workspace-scorebar-grid{
  height:100px!important;
  display:grid!important;
  grid-template-columns:repeat(10,minmax(136px,1fr))!important;
  gap:8px!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  padding:3px 2px 7px!important;
  scrollbar-width:thin;
  scrollbar-color:rgba(148,163,184,.28) transparent;
}
.workspace-scorebar-grid::-webkit-scrollbar{height:4px}
.workspace-scorebar-grid::-webkit-scrollbar-track{background:transparent}
.workspace-scorebar-grid::-webkit-scrollbar-thumb{background:rgba(148,163,184,.25);border-radius:999px}
.workspace-scorebar-cell{
  --b46-card-accent:#64748b;
  --b46-card-glow:rgba(100,116,139,.14);
  position:relative!important;
  box-sizing:border-box!important;
  height:90px!important;
  min-height:90px!important;
  padding:9px 10px 8px!important;
  border:1px solid rgba(148,163,184,.14)!important;
  border-radius:11px!important;
  background:#111922!important;
  background-image:linear-gradient(145deg,rgba(255,255,255,.025),rgba(255,255,255,0) 52%)!important;
  color:#f1f5f9!important;
  box-shadow:0 0 0 1px var(--b46-card-glow),0 7px 20px rgba(0,0,0,.16)!important;
  text-align:left!important;
  overflow:hidden!important;
  isolation:isolate;
}
.workspace-scorebar-grid>.workspace-scorebar-cell:not(:last-child){border-right:1px solid rgba(148,163,184,.14)!important}
.workspace-scorebar-cell::before{
  content:"";
  position:absolute;
  z-index:2;
  top:-1px;
  left:10px;
  right:10px;
  height:2px;
  border-radius:999px;
  background:var(--b46-card-accent);
  box-shadow:0 0 10px var(--b46-card-glow),0 0 4px var(--b46-card-accent);
  opacity:.9;
  pointer-events:none;
}
.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win{
  --b46-card-accent:#22c55e;
  --b46-card-glow:rgba(34,197,94,.16);
  background:#111922!important;
  background-image:linear-gradient(145deg,rgba(34,197,94,.055),rgba(17,25,34,0) 58%)!important;
}
.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss{
  --b46-card-accent:#ef4444;
  --b46-card-glow:rgba(239,68,68,.15);
  background:#111922!important;
  background-image:linear-gradient(145deg,rgba(239,68,68,.05),rgba(17,25,34,0) 58%)!important;
}
.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-draw{
  --b46-card-accent:#94a3b8;
  --b46-card-glow:rgba(148,163,184,.14);
  background:#111922!important;
  background-image:linear-gradient(145deg,rgba(148,163,184,.045),rgba(17,25,34,0) 58%)!important;
}
.workspace-scorebar-cell.workspace-scorebar-pending{
  --b46-card-accent:#f59e0b;
  --b46-card-glow:rgba(245,158,11,.15);
  background:#111922!important;
  background-image:linear-gradient(145deg,rgba(245,158,11,.052),rgba(17,25,34,0) 58%)!important;
}
.workspace-scorebar-cell.workspace-scorebar-signal-result,
.workspace-scorebar-cell.workspace-scorebar-signal-result *,
.workspace-scorebar-cell.workspace-scorebar-pending,
.workspace-scorebar-cell.workspace-scorebar-pending *{text-shadow:none!important}
.workspace-scorebar-cell:hover{
  transform:translateY(-1px);
  border-color:rgba(148,163,184,.24)!important;
  box-shadow:0 0 0 1px var(--b46-card-glow),0 10px 24px rgba(0,0,0,.2)!important;
}
.workspace-scorebar-meta{
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:6px!important;
  margin:0 0 5px!important;
  min-width:0!important;
  color:#94a3b8!important;
  font-size:8px!important;
  font-weight:800!important;
  line-height:1.1!important;
  letter-spacing:.02em!important;
  white-space:nowrap!important;
}
.workspace-scorebar-meta i{
  min-width:0!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  color:var(--b46-card-accent)!important;
  font-size:8px!important;
  font-style:normal!important;
  font-weight:900!important;
  letter-spacing:.025em!important;
}
.workspace-scorebar-meta b{
  flex:0 0 auto!important;
  color:#f8fafc!important;
  font-size:12px!important;
  font-weight:800!important;
  line-height:1!important;
}
.workspace-scorebar-match,
.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-match{
  display:block!important;
  margin:0 0 5px!important;
  color:#f1f5f9!important;
  font-size:10px!important;
  font-weight:750!important;
  line-height:1.2!important;
  letter-spacing:-.01em!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
}
.workspace-scorebar-pick,
.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick{
  display:flex!important;
  flex-direction:row!important;
  align-items:center!important;
  justify-content:space-between!important;
  gap:7px!important;
  min-width:0!important;
  line-height:1.1!important;
}
.workspace-scorebar-pick strong,
.workspace-scorebar-pick em,
.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick strong,
.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick em{
  min-width:0!important;
  font-size:8px!important;
  line-height:1.1!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
}
.workspace-scorebar-pick strong,
.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick strong{
  flex:1 1 auto!important;
  color:#cbd5e1!important;
  font-weight:750!important;
}
.workspace-scorebar-pick em,
.workspace-scorebar-cell.workspace-scorebar-pending .workspace-scorebar-pick em{
  flex:0 1 auto!important;
  color:#f8fafc!important;
  font-style:normal!important;
  font-weight:800!important;
}
.workspace-scorebar-details{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr)!important;
  align-items:center!important;
  gap:4px!important;
  margin-top:6px!important;
  padding-top:5px!important;
  border-top:1px solid rgba(148,163,184,.11)!important;
  color:#94a3b8!important;
  font-size:7px!important;
  line-height:1!important;
  white-space:nowrap!important;
  min-width:0!important;
}
.workspace-scorebar-details>span{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important}
.workspace-scorebar-details i{font-style:normal!important;font-size:6.5px!important;font-weight:750!important;letter-spacing:.04em!important;opacity:.72!important}
.workspace-scorebar-details b{display:block!important;margin-top:1px!important;color:#e2e8f0!important;font-size:7.5px!important;font-weight:800!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:100%!important}
.workspace-scorebar-detail-minute{color:#64748b!important;text-align:center!important;font-size:7px!important;font-weight:800!important}
.workspace-scorebar-cell.placeholder{
  opacity:.52!important;
  display:flex!important;
  flex-direction:column!important;
  justify-content:center!important;
  background:#111922!important;
}
@media(max-width:900px){
  .workspace-scorebar-grid{grid-template-columns:repeat(10,minmax(132px,1fr))!important;gap:7px!important;height:96px!important}
  .workspace-scorebar-cell{height:86px!important;min-height:86px!important;padding:8px 9px 7px!important}
  .workspace-scorebar-match{font-size:9.5px!important}
}
`;
s+=css;
if(!s.includes(MARK))throw new Error('TOPCARDS_CLEAN_UI_MARKER_MISSING');
fs.writeFileSync(outPath,s);
console.log(JSON.stringify({ok:true,marker:MARK,inputBytes:Buffer.byteLength(fs.readFileSync(srcPath)),outputBytes:Buffer.byteLength(s)}));
