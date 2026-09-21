from pathlib import Path

idx=Path('nomad-live-343/index.html')
h=idx.read_text()
registry_tag='<script src="market-registry-343.js?v=343-market-registry-v1" defer></script>'
if registry_tag not in h:
    anchor='<script src="signal-next.js?v=343-singlepage-signal-3" defer></script>'
    if anchor not in h: raise SystemExit('index signal anchor not found')
    h=h.replace(anchor,registry_tag+anchor,1)
idx.write_text(h)

sp=Path('nomad-live-343/singlepage-workspace-343.js')
s=sp.read_text()

s=s.replace(
"const state={view:'live',market:'all',filter:'all',page:1,rows:[],statsLoaded:false,statsLoading:false,statsLoadedAt:0};",
"const state={view:'live',market:'all',variant:'all',filter:'all',page:1,rows:[],statsLoaded:false,statsLoading:false,statsLoadedAt:0};"
)

old="function marketKey(r){const x=String(r?.marketLabel||r?.market||r?.providerMarket||'').toLowerCase();if(/corner/.test(x))return'corners';if(/card/.test(x))return'cards';if(/btts|both teams/.test(x))return'btts';if(/asian|handicap|\\bah\\b/.test(x))return'ah';if(/over|under|o\\/u|total/.test(x))return'ou';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';return'other'}"
new="function marketDef(r){return window.BALL46_MARKET_REGISTRY?.resolve?.(r)||null}\nfunction marketKey(r){const d=marketDef(r);if(d?.family)return d.family;const x=String(r?.marketLabel||r?.market||r?.providerMarket||'').toLowerCase();if(/corner/.test(x))return'corners';if(/card/.test(x))return'cards';if(/btts|both teams/.test(x))return'btts';if(/asian|handicap|\\bah\\b/.test(x))return'ah';if(/over|under|o\\/u|total/.test(x))return'ou';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';return'other'}"
if old in s:
    s=s.replace(old,new,1)
elif 'function marketDef(r)' not in s:
    raise SystemExit('marketKey anchor not found')

old="function rowsForMarket(){return state.market==='all'?state.rows:state.rows.filter(r=>marketKey(r)===state.market)}"
new="function rowsForMarket(){let rows=state.market==='all'?state.rows:state.rows.filter(r=>marketKey(r)===state.market);if(state.variant!=='all')rows=rows.filter(r=>marketDef(r)?.key===state.variant);return rows}"
if old in s:
    s=s.replace(old,new,1)
elif "state.variant!=='all'" not in s:
    raise SystemExit('rowsForMarket anchor not found')

old="function parseRoute(){const q=new URLSearchParams(location.search),view=q.get('view'),market=q.get('market'),filter=q.get('filter');state.view=['live','signal','statistics'].includes(view)?view:'live';state.market=MARKETS.some(m=>m.id===market)?market:'all';state.filter=filter||'all';state.page=Math.max(1,Number(q.get('page'))||1);return q.get('status')||'all'}"
new="function parseRoute(){const q=new URLSearchParams(location.search),view=q.get('view'),market=q.get('market'),variant=q.get('variant'),filter=q.get('filter');state.view=['live','signal','statistics'].includes(view)?view:'live';state.market=MARKETS.some(m=>m.id===market)?market:'all';const allowed=window.BALL46_MARKET_REGISTRY?.variants?.(state.market)||[];state.variant=allowed.some(v=>v.key===variant)?variant:'all';state.filter=filter||'all';state.page=Math.max(1,Number(q.get('page'))||1);return q.get('status')||'all'}"
if old in s:
    s=s.replace(old,new,1)
elif "variant=q.get('variant')" not in s:
    raise SystemExit('parseRoute anchor not found')

old="function writeRoute({replace=false,status=null}={}){const q=new URLSearchParams();if(state.view!=='live')q.set('view',state.view);if(state.view==='statistics'&&state.market!=='all')q.set('market',state.market);if(state.view==='statistics'&&state.filter!=='all')q.set('filter',state.filter);if(state.view==='statistics'&&state.page>1)q.set('page',state.page);if(state.view==='live'&&status&&status!=='all')q.set('status',status);const url=`${location.pathname}${q.toString()?`?${q}`:''}`;(replace?history.replaceState:history.pushState).call(history,null,'',url)}"
new="function writeRoute({replace=false,status=null}={}){const q=new URLSearchParams();if(state.view!=='live')q.set('view',state.view);if(state.view==='statistics'&&state.market!=='all')q.set('market',state.market);if(state.view==='statistics'&&state.variant!=='all')q.set('variant',state.variant);if(state.view==='statistics'&&state.filter!=='all')q.set('filter',state.filter);if(state.view==='statistics'&&state.page>1)q.set('page',state.page);if(state.view==='live'&&status&&status!=='all')q.set('status',status);const url=`${location.pathname}${q.toString()?`?${q}`:''}`;(replace?history.replaceState:history.pushState).call(history,null,'',url)}"
if old in s:
    s=s.replace(old,new,1)
elif "q.set('variant',state.variant)" not in s:
    raise SystemExit('writeRoute anchor not found')

old="function setView(view,{market=null,push=true}={}){state.view=view;if(market){state.market=market;state.filter='all';state.page=1}"
new="function setView(view,{market=null,push=true}={}){state.view=view;if(market){state.market=market;state.variant='all';state.filter='all';state.page=1}"
if old in s:
    s=s.replace(old,new,1)
elif "state.variant='all';state.filter='all'" not in s:
    raise SystemExit('setView anchor not found')

anchor="function renderFilters(){const f=filters(),wrap=$('[data-sp-filter-chips]');if(!wrap)return;wrap.innerHTML=f.map(x=>`<button type=\"button\" class=\"sp-filter-chip ${state.filter===x.id?'active':''}\" data-sp-filter=\"${esc(x.id)}\">${esc(x.label)}${x.count===undefined?'':` · ${x.count}`}</button>`).join('');$$('[data-sp-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.spFilter;state.page=1;writeRoute();renderStats()}))}"
variant_fn="function renderVariants(){const box=$('[data-sp-variant-filters]'),wrap=$('[data-sp-variant-chips]');if(!box||!wrap)return;const variants=state.market==='all'?[]:(window.BALL46_MARKET_REGISTRY?.variants?.(state.market)||[]);box.hidden=!variants.length;if(!variants.length){state.variant='all';wrap.innerHTML='';return}if(state.variant!=='all'&&!variants.some(v=>v.key===state.variant))state.variant='all';const list=[{key:'all',short:'All types'},...variants];wrap.innerHTML=list.map(v=>`<button type=\"button\" class=\"sp-filter-chip ${state.variant===v.key?'active':''}\" data-sp-variant=\"${esc(v.key)}\">${esc(v.short||v.label||v.key)}</button>`).join('');$$('[data-sp-variant]').forEach(b=>b.addEventListener('click',()=>{state.variant=b.dataset.spVariant;state.filter='all';state.page=1;writeRoute();renderStats()}))}\n"
if 'function renderVariants()' not in s:
    if anchor not in s: raise SystemExit('renderFilters anchor not found')
    s=s.replace(anchor,variant_fn+anchor,1)

old="function renderStatHeader(){const m=currentMarket(),f=filters();if(!f.some(x=>x.id===state.filter))state.filter='all';$('[data-sp-market-title]').textContent=m.title;$('[data-sp-market-desc]').textContent=m.desc;const selected=f.find(x=>x.id===state.filter);$('[data-sp-filter-label]').textContent=selected?.label||'All results'}"
new="function renderStatHeader(){const m=currentMarket(),f=filters();if(!f.some(x=>x.id===state.filter))state.filter='all';$('[data-sp-market-title]').textContent=m.title;$('[data-sp-market-desc]').textContent=m.desc;const selected=f.find(x=>x.id===state.filter),variant=state.variant==='all'?null:window.BALL46_MARKET_REGISTRY?.definitions?.[state.variant];$('[data-sp-filter-label]').textContent=[variant?.short,selected?.label||'All results'].filter(Boolean).join(' · ')}"
if old in s:
    s=s.replace(old,new,1)
elif "variant?.short" not in s:
    raise SystemExit('renderStatHeader anchor not found')

s=s.replace('function renderStats(){if(!state.statsLoaded)return;renderStatNav();renderStatHeader();const rows=filteredRows();renderKpis(rows);renderGraph(rows);renderFilters();renderTable(rows)}','function renderStats(){if(!state.statsLoaded)return;renderStatNav();renderVariants();renderStatHeader();const rows=filteredRows();renderKpis(rows);renderGraph(rows);renderFilters();renderTable(rows)}')

sp.write_text(s)

# Add compact market-type subfilter inside Statistics main content.
h=idx.read_text()
variant_html='<section class="sp-filters sp-variant-filters" data-sp-variant-filters hidden><div class="sp-filter-title"><span>MARKET TYPE</span><b>Engine registry</b></div><div class="sp-filter-chips" data-sp-variant-chips></div></section>'
filter_anchor='<section class="sp-filters"><div class="sp-filter-title"><span>MARKET FILTER</span><b>Refine current view</b></div><div class="sp-filter-chips" data-sp-filter-chips><button class="sp-filter-chip active">All results</button></div></section>'
if variant_html not in h:
    if filter_anchor not in h: raise SystemExit('statistics filter HTML anchor not found')
    h=h.replace(filter_anchor,variant_html+filter_anchor,1)
idx.write_text(h)
