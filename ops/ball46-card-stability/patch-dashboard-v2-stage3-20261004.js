const fs=require('fs');
const [,,srcPath,outPath]=process.argv;
if(!srcPath||!outPath) throw new Error('USAGE: node patch_dashboard_stable_dom.js <src> <out>');
let s=fs.readFileSync(srcPath,'utf8');
const MARK='B46_STABLE_MATCH_CARD_DOM_20261004';
if(s.includes(MARK)) throw new Error('STABLE_CARD_DOM_ALREADY_PRESENT');
const start=s.indexOf('function renderBoard(){');
const end=s.indexOf('function setText(',start);
if(start<0||end<0||end<=start) throw new Error('RENDER_BOARD_ANCHOR_NOT_FOUND');
const old=s.slice(start,end);
if(!old.includes('host.innerHTML=')||!old.includes("$$('[data-match-id]')")) throw new Error('UNEXPECTED_RENDER_BOARD_SHAPE');
const replacement=`/* ${MARK}: preserve keyed match-card DOM across refreshes; rebuild structure only when membership/order really changes. */
let stableBoardStructureKey='';
function stableMarkupKey(markup){let h=2166136261;for(let i=0;i<markup.length;i++){h^=markup.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+':'+markup.length}
function bindStableMatchRow(el){if(!el||el.dataset.b46StableBound==='1')return;el.dataset.b46StableBound='1';const choose=()=>{selectedId=el.dataset.matchId;renderBoard();renderFeatured()};el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}})}
function bindStableExpandButton(btn){if(!btn||btn.dataset.b46StableBound==='1')return;btn.dataset.b46StableBound='1';btn.addEventListener('click',()=>{const k=btn.dataset.expandGroup;expandedGroups.has(k)?expandedGroups.delete(k):expandedGroups.add(k);renderBoard()})}
function syncStableMatchRow(el,desired,markup){if(!el||!desired)return;const renderKey=stableMarkupKey(markup);if(el.className!==desired.className)el.className=desired.className;for(const name of ['tabindex','role','aria-label']){const next=desired.getAttribute(name);if(next===null)el.removeAttribute(name);else if(el.getAttribute(name)!==next)el.setAttribute(name,next)}if(el.dataset.b46RenderKey!==renderKey){el.innerHTML=desired.innerHTML;el.dataset.b46RenderKey=renderKey}bindStableMatchRow(el)}
function renderBoard(){
  renderWorkspaceScorebar();
  const host=$('[data-board-sections]');if(!host)return;
  const rows=visibleRows(),order=['live','scheduled','unknown','finished'],html=[],structure=[];
  for(const key of order){
    const all=rows.filter(f=>classify(f)===key);if(!all.length)continue;
    const open=expandedGroups.has(key),shown=open?all:all.slice(0,COLLAPSED_LIMIT),leagueGroups=groupByLeague(shown);
    structure.push([key,all.length,open?1:0,leagueGroups.map(([league,list])=>[league,list.map(fixtureKey)])]);
    html.push(\`<section class="status-section" data-status-section="\${key}"><header class="status-head"><div><i class="status-dot \${statusDotClass(key)}"></i><h2>\${statusLabel(key)}</h2></div><b>\${all.length}</b></header>\${leagueGroups.map(([league,list])=>\`<section class="league-block"><header class="league-head"><strong>\${esc(league)}</strong><span>\${list.length} match\${list.length===1?'':'es'}</span></header>\${list.map(rowHtml).join('')}</section>\`).join('')}\${all.length>COLLAPSED_LIMIT?\`<div class="show-more"><button type="button" data-expand-group="\${key}">\${open?'Show less':\`View all \${all.length}\`}</button></div>\`:''}</section>\`);
  }
  const nextHtml=html.length?html.join(''):\`<div class="board-empty">\${document.body.dataset.workspaceView==='signal'?'No active signals match the current filters.':'No matches match the current filters.'}</div>\`;
  const nextStructureKey=JSON.stringify([document.body.dataset.workspaceView||'',structure,html.length?1:0]);
  const currentRows=new Map();host.querySelectorAll('[data-match-id]').forEach(el=>{const id=String(el.dataset.matchId||'');if(id&&!currentRows.has(id))currentRows.set(id,el)});
  const template=document.createElement('template');template.innerHTML=nextHtml;
  const desiredRows=[...template.content.querySelectorAll('[data-match-id]')];
  const sameStructure=stableBoardStructureKey===nextStructureKey&&currentRows.size===desiredRows.length&&desiredRows.every(el=>currentRows.has(String(el.dataset.matchId||'')));
  if(sameStructure){
    for(const desired of desiredRows){const id=String(desired.dataset.matchId||''),existing=currentRows.get(id);syncStableMatchRow(existing,desired,desired.outerHTML)}
    stableBoardStructureKey=nextStructureKey;
    host.querySelectorAll('[data-expand-group]').forEach(bindStableExpandButton);
    return;
  }
  for(const desired of desiredRows){const id=String(desired.dataset.matchId||''),existing=currentRows.get(id);if(existing){syncStableMatchRow(existing,desired,desired.outerHTML);desired.replaceWith(existing)}else{desired.dataset.b46RenderKey=stableMarkupKey(desired.outerHTML);bindStableMatchRow(desired)}}
  host.replaceChildren(template.content);
  stableBoardStructureKey=nextStructureKey;
  host.querySelectorAll('[data-match-id]').forEach(bindStableMatchRow);
  host.querySelectorAll('[data-expand-group]').forEach(bindStableExpandButton);
}
`;
s=s.slice(0,start)+replacement+s.slice(end);
if(!s.includes(MARK)) throw new Error('PATCH_MARKER_MISSING');
if(s.includes('function renderBoard(){renderWorkspaceScorebar();')) throw new Error('OLD_RENDER_BOARD_STILL_PRESENT');
fs.writeFileSync(outPath,s);
console.log(JSON.stringify({ok:true,marker:MARK,inputBytes:Buffer.byteLength(fs.readFileSync(srcPath)),outputBytes:Buffer.byteLength(s),fetchCountBefore:(fs.readFileSync(srcPath,'utf8').match(/\bfetch\(/g)||[]).length,fetchCountAfter:(s.match(/\bfetch\(/g)||[]).length}));
