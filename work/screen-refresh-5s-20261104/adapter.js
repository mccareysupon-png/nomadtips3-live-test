/* B46_SCREEN_REFRESH_5S_20261104: cache-only time/score display.
   Existing Engine board, Signal, Statistics and Event Flow loops stay unchanged. */
const LIVE_DISPLAY_POLL_MS=5000;
let liveDisplaySnapshot=null,liveDisplayLoading=false,liveDisplayStarted=false;
function mergeLiveDisplay(rows,board){return projectLiveDisplay(rows,liveDisplaySnapshot,board)}
function liveDisplayText(el,value){
 if(!el)return;value=String(value);if(el.textContent===value)return;
 const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];let n;while((n=walker.nextNode()))nodes.push(n);
 // Existing text nodes only: do not trigger the expanded-board childList observer.
 if(!nodes.length)return;nodes[0].nodeValue=value;for(let i=1;i<nodes.length;i++)if(nodes[i].nodeValue)nodes[i].nodeValue='';
}
function prepareLiveDisplayClock(el){
 const clock=el?.querySelector('.score-cell .b46-live-clock-text');if(!clock)return;
 let mark=clock.querySelector('.b46-live-minute-mark');
 if(!mark){mark=document.createElement('span');mark.className='b46-live-minute-mark';mark.append(document.createTextNode(''));clock.append(mark);}
 if(!mark.firstChild)mark.append(document.createTextNode(''));
}
function paintLiveDisplay(){
 for(const row of document.querySelectorAll('[data-board-sections] .match-row[data-match-id]')){
 const f=fixtures.find(f=>fixtureKey(f)===String(row.dataset.matchId));if(!f)continue;
 const p=scorePair(f),scores=[p.home===null?'—':show(p.home),p.away===null?'—':show(p.away)];
 for(const selector of ['.teams-cell > .desktop-team-score','.score-cell > strong'])row.querySelectorAll(selector).forEach((el,i)=>liveDisplayText(el,scores[i]??'—'));
 const clock=row.querySelector('.score-cell > small:not(.half-score)'),text=classify(f)==='live'?'LIVE · '+clockLabel(f):detailedStatus(f),span=clock?.querySelector('.b46-live-clock-text'),mark=span?.querySelector('.b46-live-minute-mark');
 if(span&&mark&&span.firstChild?.nodeType===Node.TEXT_NODE){const quote=/['’′]$/.test(text),prefix=quote?text.slice(0,-1):text,tick=quote?"'":'';if(span.firstChild.nodeValue!==prefix)span.firstChild.nodeValue=prefix;if(mark.firstChild.nodeValue!==tick)mark.firstChild.nodeValue=tick;}
 else liveDisplayText(clock,text);
 const h=num(f?.goals?.halfHome),a=num(f?.goals?.halfAway);if(h!==null&&a!==null)liveDisplayText(row.querySelector('.half-score'),'HT '+show(h)+'–'+show(a));
 }
 const selected=fixtures.find(f=>fixtureKey(f)===selectedId);
 if(selected){for(const host of document.querySelectorAll('[data-featured]')){liveDisplayText(host.querySelector('[data-featured-status]'),detailedStatus(selected));liveDisplayText(host.querySelector('[data-featured-score]'),scoreLabel(selected));}}
 // Mobile adapter observes native text changes; Statistics reads getFixture().
}
async function loadLiveDisplay(){
 if(liveDisplayLoading||document.visibilityState==='hidden')return;
 liveDisplayLoading=true;const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),8000);
 try{
 const r=await fetch('/api/hub/snapshot?_='+Date.now(),{cache:'no-store',signal:ac.signal});if(!r.ok)return;
 const snapshot=await r.json();if(!validDisplaySnapshot(snapshot)||displayStamp(snapshot)<displayStamp(liveDisplaySnapshot))return;
 liveDisplaySnapshot=snapshot;const next=mergeLiveDisplay(fixtures,boardMeta);if(next.some((f,i)=>f!==fixtures[i])){fixtures=next;paintLiveDisplay();}
 }catch{}finally{clearTimeout(timeout);liveDisplayLoading=false;}
}
function startLiveDisplayLoop(){
 if(liveDisplayStarted)return;liveDisplayStarted=true;loadLiveDisplay();setInterval(loadLiveDisplay,LIVE_DISPLAY_POLL_MS);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadLiveDisplay()});
}


