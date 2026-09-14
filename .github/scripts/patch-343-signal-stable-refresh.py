from pathlib import Path
import re

p=Path('nomad-live-343/signal.js')
s=p.read_text()
pattern=r"function render\(j\)\{.*?\}\nasync function load\(\)\{"
new=r'''function signalCardElement(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild}
function syncSignalAttrs(cur,next){const preserveFlowMounted=cur.matches?.('.nomad-event-flow-card')?cur.getAttribute('data-flow-mounted'):null;const preserveDetailsOpen=cur.matches?.('details.signal-technical')&&cur.open;for(const a of [...cur.attributes]){if(a.name==='data-flow-mounted'&&preserveFlowMounted!==null)continue;if(!next.hasAttribute(a.name))cur.removeAttribute(a.name)}for(const a of [...next.attributes]){if(cur.getAttribute(a.name)!==a.value)cur.setAttribute(a.name,a.value)}if(preserveFlowMounted!==null)cur.setAttribute('data-flow-mounted',preserveFlowMounted);if(preserveDetailsOpen)cur.open=true}
function morphSignalNode(cur,next){if(!cur||!next)return;if(cur.nodeType!==next.nodeType||(cur.nodeType===1&&cur.tagName!==next.tagName)){cur.replaceWith(next.cloneNode(true));return}if(cur.nodeType===3){if(cur.nodeValue!==next.nodeValue)cur.nodeValue=next.nodeValue;return}if(cur.nodeType!==1)return;if(cur.matches('.nomad-event-flow-card')){syncSignalAttrs(cur,next);return}syncSignalAttrs(cur,next);let i=0;while(i<Math.max(cur.childNodes.length,next.childNodes.length)){const a=cur.childNodes[i],b=next.childNodes[i];if(!a&&b){cur.appendChild(b.cloneNode(true));i++;continue}if(a&&!b){a.remove();continue}morphSignalNode(a,b);i++}}
function captureSignalAnchor(board){const card=board.querySelector('.active-signal-card.expanded');return card?{id:card.dataset.matchId,top:card.getBoundingClientRect().top}:null}
function restoreSignalAnchor(board,anchor){if(!anchor)return;const card=board.querySelector(`.active-signal-card[data-match-id="${CSS.escape(anchor.id)}"]`);if(!card)return;const delta=card.getBoundingClientRect().top-anchor.top;if(Number.isFinite(delta)&&Math.abs(delta)>1)window.scrollBy(0,delta)}
function reconcileSignalBoard(board,groups){const anchor=captureSignalAnchor(board),ids=new Set(groups.map(g=>g.id)),desired=[];board.querySelectorAll(':scope > .active-signal-card').forEach(card=>{if(!ids.has(String(card.dataset.matchId||'')))card.remove()});board.querySelectorAll(':scope > .active-signal-empty').forEach(x=>x.remove());for(const g of groups){const selector=`:scope > .active-signal-card[data-match-id="${CSS.escape(g.id)}"]`;let card=board.querySelector(selector),fresh=signalCardElement(matchCard(g));if(card)morphSignalNode(card,fresh);else card=fresh;desired.push(card)}for(let i=0;i<desired.length;i++){const card=desired[i],at=board.children[i];if(at!==card)board.insertBefore(card,at||null)}restoreSignalAnchor(board,anchor)}
function render(j){const rows=Array.isArray(j.signals)?j.signals:[],groups=groupMatches(rows);document.querySelector('[data-active-matches]')?.replaceChildren(document.createTextNode(groups.length));document.querySelector('[data-active-signals]')?.replaceChildren(document.createTextNode(rows.length));renderMarketSummary(rows);const board=document.querySelector('[data-signal-body]');if(!board)return;const ids=new Set(groups.map(g=>g.id));for(const id of [...expanded])if(!ids.has(id))expanded.delete(id);if(!groups.length){if(!board.querySelector('.active-signal-empty'))board.innerHTML='<div class="active-signal-empty"><b>NO ACTIVE SIGNAL</b><span>ยังไม่มี Signal ที่กำลังแข่งขันอยู่</span></div>';else if(board.querySelector('.active-signal-card'))board.innerHTML='<div class="active-signal-empty"><b>NO ACTIVE SIGNAL</b><span>ยังไม่มี Signal ที่กำลังแข่งขันอยู่</span></div>';const age=num(j?.mirror?.hubAgeMs);state('live',`Active Signal Board · 0 match${age===null?'':` · feed age ${Math.round(age/1000)}s`}`);return}reconcileSignalBoard(board,groups);window.NOMAD_EVENT_FLOW_343?.hydrate(board);const age=num(j?.mirror?.hubAgeMs);state('live',`Active Signal Board · ${groups.length} match · ${rows.length} signal${age===null?'':` · feed age ${Math.round(age/1000)}s`}`)}
async function load(){'''
ns,n=re.subn(pattern,new,s,count=1,flags=re.S)
if n!=1:
    raise SystemExit(f'render marker replacement count={n}')
p.write_text(ns)

h=Path('nomad-live-343/signal.html')
x=h.read_text()
x=re.sub(r'signal\.js\?v=[^"\']+', 'signal.js?v=343-signal-stable-refresh-v1', x)
h.write_text(x)
