// BALL46 B46-STAT-UI-01 current frontend STAGING ONLY.
// Verified gzip binary fast source guard and cursor fallback (staging-only release 2026-11-16).
// STAGING: single-page revision check before any 33-page historical refresh; no Production mutation.
// GET-only mirror of current public site, scoped CSS + verified loader-recovery patch only.
// Stage-only KPI right-card consolidation and balanced net typography (QA enabled).
// No Production writes, no secrets forwarded, and no Production Cloudflare Worker mutation.
import css from './live-staging-overlay.css';
import {patchCurrentStatisticsLoader} from './statistics-loader-staging-patch.mjs';
import {patchIndexedStatisticsCache} from './indexed-stats-stage.mjs';
import {stageSummaryScript} from './statistics-summary-layout-stage.mjs';
import {stageFastChartScript} from './fast-chart-firstpaint-stage.mjs';
import {patchStageLazyStatistics,patchStageLazyChart} from './lazy-detail-stage-patch.mjs';
const ORIGIN = 'https://www.ball46.com';
const stamp = 'B46-STAT-UI-01-real-ui-v1';
const json = (data,status=200) => new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json; charset=UTF-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}
});
const baseHeaders = {
  'cache-control':'no-store, max-age=0',
  'x-robots-tag':'noindex, nofollow',
  'x-b46-staging':'REAL-UI-READONLY',
  'x-content-type-options':'nosniff'
};
export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (!['GET','HEAD'].includes(request.method)) return json({ok:false,error:'READ_ONLY_STAGING'},405);
    if (u.pathname === '/_b46_ui_health') return json({ok:true,mode:'real-frontend-read-only',stamp,origin:'ball46.com',productionWrites:0,overlay:'live-staging-overlay.css'});
    if (u.pathname === '/_b46_fast_graph.js') return new Response(request.method==='HEAD'?null:stageFastChartScript,{
      headers:{...baseHeaders,'content-type':'application/javascript; charset=UTF-8','x-b46-fast-chart':'STAGING_ONLY'}
    });
    if (u.pathname === '/_b46_stats_summary.js') return new Response(request.method==='HEAD'?null:stageSummaryScript,{
      headers:{...baseHeaders,'content-type':'application/javascript; charset=UTF-8','x-b46-summary':'STAGING_ONLY'}
    });
    if (u.pathname === '/_b46_ui_overlay.css') return new Response(request.method==='HEAD'?null:css,{
      headers:{...baseHeaders,'content-type':'text/css; charset=UTF-8','x-b46-overlay':stamp}
    });
    // STAGING ONLY: exact all-market / all-time graph built once from full verified Ledger.
    // Other market/range/filter selections MUST keep using the original renderer.
    if(u.pathname==='/_b46_stage_stats_chart'){
      if(!env.B46_STAGE_STATS_KV)return json({ok:false,error:'STAGE_KV_MISSING'},503);
      try{
        const meta=await env.B46_STAGE_STATS_KV.get('verified-full-meta-v1','json');
        if(meta?.schema!==2||!/^verified-chart-v1-[0-9a-f]{32}$/.test(meta.chartKey||'')||
           !Number.isFinite(Number(meta.savedAt))||
           Date.now()-Number(meta.checkedAt||meta.savedAt)>259200000)
          return json({ok:false,error:'STAGE_GRAPH_NOT_READY'},503);
        const raw=await env.B46_STAGE_STATS_KV.get(meta.chartKey,'text');
        if(!raw)return json({ok:false,error:'STAGE_GRAPH_KV_NOT_VISIBLE'},503);
        const g=JSON.parse(raw);
        if(g?.ok!==true||g.schema!==1||g.source!=='VERIFIED_FULL_LEDGER_ONLY'||
           g.market!=='all'||g.range!=='all'||g.variant!=='all'||g.filter!=='all'||
           g.asOf!==meta.savedAt||g.summary?.rows!==meta.settled||
           !Array.isArray(g.series?.units)||!Array.isArray(g.series?.roi)||
           !Array.isArray(g.series?.rate)||
           Object.hasOwn(g,'rows'))
          return json({ok:false,error:'STAGE_GRAPH_SOURCE_MISMATCH'},503);
        return new Response(request.method==='HEAD'?null:raw,{status:200,headers:{
          ...baseHeaders,'content-type':'application/json; charset=UTF-8',
          'x-b46-read-path':'STAGING_VERIFIED_GRAPH_KV',
          'x-b46-snapshot-at':String(meta.savedAt)
        }});
      }catch(error){
        return json({ok:false,error:'STAGE_GRAPH_READ_FAILED'},503);
      }
    }
    // STAGING ONLY: O(1) compact original-source aggregates, never full historical rows.
    // The manifest is published only after full + compact immutable blobs pass hash readback.
    if(u.pathname==='/_b46_stage_stats_summary'){
      if(!env.B46_STAGE_STATS_KV)return json({ok:false,error:'STAGE_KV_MISSING'},503);
      try{
        const meta=await env.B46_STAGE_STATS_KV.get('verified-full-meta-v1','json');
        if(meta?.schema!==2||!/^verified-head-v1-[0-9a-f]{32}$/.test(meta.summaryKey||'')||
           !Number.isFinite(Number(meta.savedAt))||
           Date.now()-Number(meta.checkedAt||meta.savedAt)>259200000)
          return json({ok:false,error:'STAGE_COMPACT_NOT_READY'},503);
        const raw=await env.B46_STAGE_STATS_KV.get(meta.summaryKey,'text');
        if(!raw)return json({ok:false,error:'STAGE_COMPACT_KV_NOT_VISIBLE'},503);
        const head=JSON.parse(raw);
        if(head?.ok!==true||head.schema!==1||
           head.mode!=='AGGREGATES_ONLY_NOT_HISTORY'||
           Number(head.snapshotSavedAt)!==Number(meta.savedAt)||
           head.ledgerTotal!==meta.ledgerTotal||
           !Number.isSafeInteger(head.total)||head.total<0||
           head.total>head.ledgerTotal||Object.hasOwn(head,'rows'))
          return json({ok:false,error:'STAGE_COMPACT_SOURCE_MISMATCH'},503);
        return new Response(request.method==='HEAD'?null:raw,{status:200,headers:{
          ...baseHeaders,'content-type':'application/json; charset=UTF-8',
          'x-b46-read-path':'STAGING_VERIFIED_COMPACT_KV',
          'x-b46-snapshot-at':String(meta.savedAt)
        }});
      }catch(error){
        return json({ok:false,error:'STAGE_COMPACT_READ_FAILED'},503);
      }
    }
    // Read-only public status for staged immutable snapshots. No Production/KV writes.
    if(u.pathname==='/_b46_stage_stats_meta'){
      if(!env.B46_STAGE_STATS_KV)return json({ok:false,error:'STAGE_KV_MISSING'},503);
      const meta=await env.B46_STAGE_STATS_KV.get('verified-full-meta-v1','json');
      if(!meta?.savedAt||!Number.isFinite(Number(meta.ledgerTotal)))
        return json({ok:false,error:'STAGE_SNAPSHOT_UNAVAILABLE'},503);
      return json({ok:true,savedAt:meta.savedAt,checkedAt:meta.checkedAt||meta.savedAt,
        ledgerTotal:meta.ledgerTotal,sourceSignature:meta.sourceSignature||null,
        immutable:meta.schema===2,ready:!!meta.key});
    }
    if (u.pathname.startsWith('/_b46_')) return json({ok:false,error:'NOT_FOUND'},404);
    // GET/HEAD-only. Do not expose internal Production GET routes through this mirror.
    const publicApi = new Set([
      '/api/engine/statistics','/api/engine/board','/api/engine/signals','/api/engine/health',
      '/api/hub/snapshot','/api/hub/health','/api/prediction-vote'
    ]);
    if (u.pathname.startsWith('/api/') && !publicApi.has(u.pathname))
      return json({ok:false,error:'STAGING_API_NOT_ALLOWED'},404);
    if (!u.pathname.startsWith('/api/') && u.pathname!=='/' &&
        !/^\/[a-zA-Z0-9_./-]+\.(?:js|css|svg|png|gif|woff2?|ico|jpeg|jpg|webp|json|html|txt|map)$/.test(u.pathname))
      return json({ok:false,error:'STAGING_PATH_NOT_ALLOWED'},404);
    if (!env.B46_PRODUCTION_READ) return json({ok:false,error:'STAGING_SERVICE_BINDING_MISSING'},503);
    // Staging-only, prevalidated compressed full-source snapshot. Never expose to Production.
    // Root unpaged API was unstable; the browser validates this complete saved payload again.
    if(request.method==='GET' && u.pathname==='/api/engine/statistics' && !u.searchParams.has('paged')){
      if(!env.B46_STAGE_STATS_KV)return json({ok:false,error:'STAGE_SNAPSHOT_STORAGE_MISSING'},503);
      try{
        const metadata=await env.B46_STAGE_STATS_KV.get('verified-full-meta-v1','json');
        const candidate=metadata?.schema===2 && typeof metadata.key==='string' &&
             /^verified-full-gzip-v2-[0-9a-f]{32}$/.test(metadata.key)
             ? metadata.key : 'verified-full-gzip-v1';
        let entry=await env.B46_STAGE_STATS_KV.get(candidate,'arrayBuffer');
        let fallbackUsed=false;
        // Cloudflare KV is eventually consistent across PoPs. A new manifest can be
        // visible before its new immutable blob; serve a previously verified version.
        if(!entry && metadata?.schema===2 && Array.isArray(metadata.previousKeys)){
          for(const previous of metadata.previousKeys.slice(0,2)){
            if(!/^verified-full-gzip-v2-[0-9a-f]{32}$/.test(previous))continue;
            entry=await env.B46_STAGE_STATS_KV.get(previous,'arrayBuffer');
            if(entry){fallbackUsed=true;break}
          }
        }
        if(!entry||!metadata?.savedAt||!metadata?.ledgerTotal||
           Date.now()-Number(metadata.checkedAt||metadata.savedAt)>259200000)
          return json({ok:false,error:'STAGE_SNAPSHOT_NOT_READY'},503);
        return new Response(entry,{status:200,headers:{
          ...baseHeaders,'content-type':'application/octet-stream',
          'vary':'Accept-Encoding',
          'x-b46-stage-snapshot':fallbackUsed?'VERIFIED_PREVIOUS':'VERIFIED_SAVED',
          'x-b46-stage-snapshot-at':String(metadata.savedAt),
          'x-b46-read-path':'STAGING_KV'
        }});
      }catch(error){
        return json({ok:false,error:'STAGE_SNAPSHOT_READ_FAILED'},503);
      }
    }
    // Static/public GET routes only. No request bodies, credentials, cookies or authorization forwarded.
    const originURL = new URL(u.pathname + u.search,ORIGIN);
    const accept = request.headers.get('accept');
    const headers = new Headers();
    if(accept) headers.set('accept',accept.slice(0,256));
    // Stats page requests now retry the failed cursor page in the staging browser.
    // Avoid nested edge+browser retries and inadvertent extra origin traffic.
    // Same-account Service Binding: no web-edge WAF/challenge between staging and target.
    // This binds ONLY the staging Worker and never changes ball46-production.
    const upstream = await env.B46_PRODUCTION_READ.fetch(new Request(originURL.toString(), {
      method:request.method,headers,redirect:'manual'
    }));
    const h = new Headers(upstream.headers);
    for(const x of ['set-cookie','content-length','content-encoding','etag','content-security-policy','content-security-policy-report-only','access-control-allow-origin','transfer-encoding']) h.delete(x);
    Object.entries(baseHeaders).forEach(([k,v])=>h.set(k,v));
    h.set('x-b46-read-path','SERVICE_BINDING');
    // Prevent accidental redirects to a Production URL when viewing the staging site.
    const location=h.get('location');
    if(location){
      const dest=new URL(location,ORIGIN);
      if(dest.origin===ORIGIN){h.set('location',u.origin+dest.pathname+dest.search+dest.hash);}
    }
    // Surgical patch: the CURRENT external Statistics Loader, not a past Work tree.
    // No settlement/formula/market/Engine changes. Source drift leaves file untouched.
    if(request.method==='GET' && upstream.ok && u.pathname==='/singlepage-workspace-343.js'){
      const original=await upstream.text();
      const recovered=patchCurrentStatisticsLoader(original);
      const patched=recovered.status==='CURRENT_LOADER_PATCHED'?patchIndexedStatisticsCache(recovered.source):recovered;
      const lazy=patchStageLazyStatistics(patched.source);
      h.set('content-type','application/javascript; charset=UTF-8');
      h.set('x-b46-staging-loader',patched.status);
      h.set('x-b46-staging-lazy',lazy.status);
      h.set('x-b46-read-path','SERVICE_BINDING');
      return new Response(lazy.source,{status:upstream.status,headers:h});
    }
    // A scope-limited staging-only patch of the CURRENT chart module's own CSS:
    // style element from the renderer is appended after our HTML stylesheet on load.
    // Make its final CSS include the thin-line, 50/50 layout so later paints cannot
    // restore the old full-width geometry. The executable loader/render logic stays unchanged.
    if(request.method==='GET' && upstream.ok && u.pathname==='/longterm-performance-343.js'){
      const source=await upstream.text();
      const begin='const f46CSS=',end=';let f46Geo=';
      const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
      let patched=source;
      let status='NOT_PATCHED_SOURCE_DRIFT';
      if(a>=0 && b>a && source.indexOf(begin,a+begin.length)===-1){
        try{
          const originalCSS=JSON.parse(source.slice(a+begin.length,b));
          if(typeof originalCSS==='string' && originalCSS.includes('.f46-line')){
            patched=source.slice(0,a+begin.length)
                +JSON.stringify(originalCSS+'\n'+css)
                +source.slice(b);
            status='CURRENT_RENDERER_CSS_PATCHED';
          }
        }catch{}
      }
      const lazy=patchStageLazyChart(patched);
      h.set('content-type','application/javascript; charset=UTF-8');
      h.set('x-b46-renderer-css',status);
      h.set('x-b46-staging-chart-lazy',lazy.status);
      return new Response(lazy.source,{status:upstream.status,headers:h});
    }
    const ct=upstream.headers.get('content-type')||'';
    if (request.method==='GET' && upstream.ok && ct.includes('text/html')){
      const original = await upstream.text();
      // Production already injects its own fast client. Never run two competing
      // preview clients on STAGING: the Production one has a separate cache API
      // and would falsely fall back to loading the entire historical Ledger.
      const productionClient='<script defer src="/b46-statistics-fast-v1-20261116.js"></script>';
      const duplicateCount=original.split(productionClient).length-1;
      if(duplicateCount>1)return json({ok:false,error:'DUPLICATE_PROD_FAST_CLIENT_SOURCE'},503);
      const isolated=original.replace(productionClient,'');
      const inject = '<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/_b46_ui_overlay.css?v=20261116-summary" data-b46-staging-overlay="1"><script defer src="/_b46_stats_summary.js?v=20261116" data-b46-stage-summary-script="1"></script><script defer src="/_b46_fast_graph.js?v=20261116-chart" data-b46-stage-fast-script="1"></script>';
      const html = isolated.includes('</head>') ? isolated.replace('</head>',inject+'</head>') : isolated;
      h.set('x-b46-stage-duplicate-prod-client',duplicateCount?'SUPPRESSED':'ABSENT');
      h.set('content-type','text/html; charset=UTF-8');
      h.set('x-b46-overlay',original.includes('</head>')?stamp:'INJECTION_ANCHOR_MISSING');
      return new Response(html,{status:upstream.status,headers:h});
    }
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers:h});
  }
};
