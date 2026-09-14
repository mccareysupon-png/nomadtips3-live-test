from pathlib import Path
import re

live=Path('nomad-live-343/live-stable-343.js')
s=live.read_text()
if 'function eventData(f)' not in s:
    marker="const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};"
    add=marker+"\nfunction eventData(f){try{return encodeURIComponent(JSON.stringify(Array.isArray(f?.events)?f.events:[]))}catch{return'%5B%5D'}}"
    if marker not in s: raise SystemExit('PAIR_MARKER_NOT_FOUND')
    s=s.replace(marker,add,1)
old="function flowHtml(f,id){return `<section class=\"nomad-event-flow-card\" data-event-flow-fixture=\"${esc(id)}\" data-home=\"${esc(f?.home?.name||'HOME')}\" data-away=\"${esc(f?.away?.name||'AWAY')}\"><div class=\"nomad-flow-loading\">Event Flow · Engine history</div></section>`}"
new="function flowHtml(f,id){return `<section class=\"nomad-event-flow-card\" data-event-flow-fixture=\"${esc(id)}\" data-home=\"${esc(f?.home?.name||'HOME')}\" data-away=\"${esc(f?.away?.name||'AWAY')}\" data-home-id=\"${esc(f?.home?.id||'')}\" data-away-id=\"${esc(f?.away?.id||'')}\" data-events=\"${esc(eventData(f))}\"><div class=\"nomad-flow-loading\">Event Flow · Engine history</div></section>`}"
if old in s: s=s.replace(old,new,1)
elif 'data-events="${esc(eventData(f))}"' not in s: raise SystemExit('FLOW_HTML_MARKER_NOT_FOUND')
if 'function patchFlow(card,f)' not in s:
    marker="function patchEvidence(card,f){"
    pos=s.find(marker)
    if pos<0: raise SystemExit('PATCH_EVIDENCE_MARKER_NOT_FOUND')
    add="function patchFlow(card,f){const flow=card.querySelector('[data-event-flow-fixture]');if(!flow)return;const next=eventData(f);flow.dataset.home=f?.home?.name||'HOME';flow.dataset.away=f?.away?.name||'AWAY';flow.dataset.homeId=String(f?.home?.id||'');flow.dataset.awayId=String(f?.away?.id||'');if(flow.dataset.events!==next){flow.dataset.events=next;flow.dataset.flowMounted='0';if(card.getAttribute('aria-expanded')==='true')window.NOMAD_EVENT_FLOW_343?.hydrate(card)}}\n"
    s=s[:pos]+add+s[pos:]
target="patchEvidence(card,f);if(card.getAttribute('aria-expanded')==='true')"
repl="patchFlow(card,f);patchEvidence(card,f);if(card.getAttribute('aria-expanded')==='true')"
if target in s: s=s.replace(target,repl,1)
elif repl not in s: raise SystemExit('PATCH_CARD_CALL_MARKER_NOT_FOUND')
live.write_text(s)

flow=Path('nomad-live-343/event-flow-343.js')
f=flow.read_text()
f=f.replace("const VERSION='343-flow-v3-stable-momentum';","const VERSION='343-flow-v4-standard-match-events';",1)
if 'function normalizeMatchEvents(el)' not in f:
    marker='function render(el,data){'
    pos=f.find(marker)
    if pos<0: raise SystemExit('RENDER_MARKER_NOT_FOUND')
    helpers="""function eventRows(el){try{return JSON.parse(decodeURIComponent(el.dataset.events||'%5B%5D'))}catch{return[]}}
function eventMinute(e){const t=e?.time;const base=num(e?.minute??e?.elapsed??e?.match_minute??e?.min??(t&&typeof t==='object'?(t.elapsed??t.minute):t));if(base===null)return null;const extra=num(e?.extra??e?.stoppage??(t&&typeof t==='object'?t.extra:null));return{minute:base,extra:extra??0,total:base+(extra??0)/100}}
function eventSide(e,el){const raw=String(e?.side??e?.team_side??e?.home_away??'').toLowerCase();if(/home|local|host/.test(raw))return'home';if(/away|visitor|guest/.test(raw))return'away';const team=e?.team??e?.club??{},id=String(team?.id??e?.team_id??e?.teamId??''),name=String(team?.name??e?.team_name??e?.teamName??'').trim().toLowerCase();if(id&&id===String(el.dataset.homeId||''))return'home';if(id&&id===String(el.dataset.awayId||''))return'away';if(name&&name===String(el.dataset.home||'').trim().toLowerCase())return'home';if(name&&name===String(el.dataset.away||'').trim().toLowerCase())return'away';return'neutral'}
function eventKind(e){const txt=[e?.type,e?.event_type,e?.category,e?.detail,e?.name,e?.event].filter(Boolean).join(' ').toLowerCase();if(/penalt/.test(txt)&&/miss|saved|fail/.test(txt))return'penalty-miss';if(/own\\s*goal|og\\b/.test(txt))return'own-goal';if(/penalt/.test(txt)&&/goal|scor/.test(txt))return'penalty-goal';if(/goal/.test(txt))return'goal';if(/second\\s*yellow|yellow.*red|2nd.*yellow/.test(txt))return'second-yellow';if(/yellow/.test(txt))return'yellow';if(/red/.test(txt))return'red';if(/sub|substitution|change/.test(txt))return'sub';if(/var|video assistant/.test(txt))return'var';if(/penalt/.test(txt))return'penalty';return null}
function eventPlayer(e){return String(e?.player?.name??e?.player_name??e?.playerName??e?.participant?.name??'').trim()}
function normalizeMatchEvents(el){const out=[];for(const e of eventRows(el)){const tm=eventMinute(e),kind=eventKind(e);if(!tm||!kind)continue;out.push({minute:tm.minute,extra:tm.extra,total:tm.total,side:eventSide(e,el),kind,player:eventPlayer(e),raw:e})}return out.sort((a,b)=>a.total-b.total)}
function eventIcon(kind){if(kind==='goal')return'⚽';if(kind==='own-goal')return'OG';if(kind==='yellow')return'';if(kind==='red')return'';if(kind==='second-yellow')return'2Y';if(kind==='sub')return'↕';if(kind==='var')return'VAR';if(kind==='penalty-goal')return'⚽P';if(kind==='penalty-miss')return'P×';if(kind==='penalty')return'P';return'•'}
function eventName(kind){return({'goal':'Goal','own-goal':'Own Goal','yellow':'Yellow Card','red':'Red Card','second-yellow':'Second Yellow / Red','sub':'Substitution','var':'VAR','penalty-goal':'Penalty Goal','penalty-miss':'Penalty Miss','penalty':'Penalty'})[kind]||'Event'}
function matchEventRail(el,events,lastMinute){if(!events.length)return'<div class=\"nomad-event-rail-empty\">MATCH EVENTS · no timeline events yet</div>';const max=Math.max(90,Number(lastMinute||0),...events.map(e=>e.minute+(e.extra?1:0))),ticks=[];for(let m=0;m<=max;m+=15)ticks.push(m);if(ticks[ticks.length-1]<max)ticks.push(Math.ceil(max/15)*15);const groups=new Map();for(const e of events){const k=`${e.side}:${e.minute}:${e.extra}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}const tickHtml=ticks.map(m=>`<span class=\"nomad-event-tick\" style=\"left:${clamp(m/max*100,0,100)}%\"><i></i><small>${m}'</small></span>`).join('');const markerHtml=[...groups.values()].map(g=>{const e=g[0],left=clamp((e.minute+(e.extra||0)/100)/max*100,1,99),minute=`${e.minute}${e.extra?`+${e.extra}`:''}'`,title=g.map(x=>`${minute} · ${eventName(x.kind)}${x.player?` · ${x.player}`:''}`).join(' | '),icons=g.map(x=>`<b class=\"nomad-event-icon ${x.kind}\" aria-hidden=\"true\">${eventIcon(x.kind)}</b>`).join('');return`<span class=\"nomad-match-event ${e.side}\" style=\"left:${left}%\" title=\"${esc(title)}\" aria-label=\"${esc(title)}\"><span class=\"nomad-event-icons\">${icons}</span><small>${minute}</small></span>`}).join('');return`<div class=\"nomad-event-rail\"><div class=\"nomad-event-rail-head\"><b>MATCH EVENTS</b><span>GOAL · CARDS · SUB · VAR · PENALTY</span></div><div class=\"nomad-event-track\"><div class=\"nomad-event-line\"></div>${tickHtml}${markerHtml}</div></div>`}
"""
    f=f[:pos]+helpers+f[pos:]
old="const firstMinute=num(points[0]?.minute),lastMinute=num(last?.minute),safeId=String(el.dataset.eventFlowFixture||'flow').replace(/[^a-zA-Z0-9_-]/g,'_'),gh=`flow-home-${safeId}`,ga=`flow-away-${safeId}`;"
new="const firstMinute=num(points[0]?.minute),lastMinute=num(last?.minute),events=normalizeMatchEvents(el),eventRail=matchEventRail(el,events,lastMinute),safeId=String(el.dataset.eventFlowFixture||'flow').replace(/[^a-zA-Z0-9_-]/g,'_'),gh=`flow-home-${safeId}`,ga=`flow-away-${safeId}`;"
if old in f: f=f.replace(old,new,1)
elif 'eventRail=matchEventRail' not in f: raise SystemExit('EVENT_RAIL_BIND_MARKER_NOT_FOUND')
old='</svg></div><div class="nomad-flow-foot">'
new='</svg></div>${eventRail}<div class="nomad-flow-foot">'
if old in f: f=f.replace(old,new,1)
elif '${eventRail}<div class="nomad-flow-foot">' not in f: raise SystemExit('EVENT_RAIL_RENDER_MARKER_NOT_FOUND')
flow.write_text(f)

css=Path('nomad-live-343/event-flow-343.css')
c=css.read_text()
if '.nomad-event-rail{' not in c:
    c += """
.nomad-event-rail{border-top:1px solid #121914;background:#030504;padding:7px 12px 9px;overflow:hidden}
.nomad-event-rail-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px;color:#7d8b82;font-size:7px;letter-spacing:.06em}.nomad-event-rail-head b{color:#b6c4bb;font-size:8px}.nomad-event-track{position:relative;height:72px;margin:0 14px}.nomad-event-line{position:absolute;left:0;right:0;top:35px;height:1px;background:#39473e}.nomad-event-tick{position:absolute;top:31px;transform:translateX(-50%);height:13px;color:#59675e;font-size:6px}.nomad-event-tick i{display:block;width:1px;height:8px;background:#2a352e;margin:0 auto}.nomad-event-tick small{position:absolute;top:10px;left:50%;transform:translateX(-50%);white-space:nowrap}.nomad-match-event{position:absolute;transform:translateX(-50%);z-index:2;display:flex;align-items:center;gap:3px;white-space:nowrap}.nomad-match-event.home{top:1px;flex-direction:column-reverse}.nomad-match-event.away{top:40px;flex-direction:column}.nomad-match-event.neutral{top:22px}.nomad-match-event small{font-size:6px;color:#819087;line-height:1}.nomad-event-icons{display:flex;align-items:center;gap:2px;min-height:17px}.nomad-event-icon{display:inline-flex;align-items:center;justify-content:center;min-width:14px;height:14px;padding:0 2px;border:1px solid #4b5a51;background:#101612;color:#edf4ef;font:900 7px/1 system-ui,sans-serif;border-radius:2px;box-sizing:border-box}.nomad-event-icon.goal,.nomad-event-icon.penalty-goal{border-color:#b7c3bb;background:#171d19;font-size:9px}.nomad-event-icon.yellow{min-width:9px;width:9px;padding:0;background:#f2cf3a;border-color:#ffe983;color:transparent}.nomad-event-icon.red{min-width:9px;width:9px;padding:0;background:#d9534f;border-color:#ff8b86;color:transparent}.nomad-event-icon.second-yellow{background:linear-gradient(90deg,#f2cf3a 0 48%,#d9534f 52% 100%);border-color:#e6d37a;color:#161616;font-size:6px}.nomad-event-icon.sub{color:#74df94;border-color:#3d6b4b}.nomad-event-icon.var{color:#d9e6de;border-color:#738178;font-size:6px}.nomad-event-icon.penalty,.nomad-event-icon.penalty-miss{color:#e7d46e;border-color:#756a35}.nomad-event-rail-empty{padding:8px 12px;border-top:1px solid #121914;background:#030504;color:#56635b;font-size:7px;letter-spacing:.05em}
@media(max-width:760px){.nomad-event-rail{padding:6px 8px 8px}.nomad-event-rail-head span{display:none}.nomad-event-track{margin:0 8px;height:68px}.nomad-event-icon{min-width:12px;height:12px;font-size:6px}.nomad-event-icon.yellow,.nomad-event-icon.red{min-width:8px;width:8px}}
"""
css.write_text(c)

index=Path('nomad-live-343/index.html')
h=index.read_text()
h=re.sub(r'event-flow-343\.css\?v=[^"\']+', 'event-flow-343.css?v=343-flow-v4-events', h)
h=re.sub(r'event-flow-343\.js\?v=[^"\']+', 'event-flow-343.js?v=343-flow-v4-events', h)
h=re.sub(r'live-stable-343\.js\?v=[^"\']+', 'live-stable-343.js?v=343-stable-bulk-v3-events', h)
index.write_text(h)
