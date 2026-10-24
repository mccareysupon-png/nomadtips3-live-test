import assert from'node:assert/strict';
import{createHash}from'node:crypto';
export const W='ball46-production',TAG='b46-search-surface-dualmode-20261024';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const css=[
 '<style id="'+TAG+'">',
 '/* Surface contrast only: existing magnifier, search behaviour and borderless styling remain. */',
 'html body .workspace.singlepage .status-head .b46-live-search,',
 'html body .workspace.singlepage .status-head .b46-live-search:focus-within{background:#122e25!important;border:0!important;outline:0!important;box-shadow:none!important;color:#d3e8dc!important;}',
 'html[data-theme="light"] body .workspace.singlepage .status-head .b46-live-search,',
 'html[data-theme="light"] body .workspace.singlepage .status-head .b46-live-search:focus-within{background:#d4e1d8!important;color:#294e3d!important;}',
 '</style>'
].join('\n');
export function patchHtml(s){
 assert(!s.includes(TAG),'ALREADY_APPLIED');
 assert.equal(s.split('</head>').length,2,'HEAD_STRUCTURE_CHANGED');
 assert(s.includes('id="b46-search-icon-only-20261024"'),'PRIOR_ICON_ONLY_STYLE_MISSING');
 assert(s.includes('id="b46-live-header-search-20261018"'),'SEARCH_BASE_CSS_MISSING');
 const updated=s.replace('</head>',css+'\n</head>');
 assert.equal(updated.replace(css+'\n',''),s,'UNRELATED_HTML_CHANGE');
 return updated;
}
export function patchWorker(s,expectedSha){
 assert.equal(hash(Buffer.from(s)),expectedSha,'ACTIVE_WORKER_DRIFT');
 assert.equal(s.split('export default {').length,2,'WORKER_EXPORT_CHANGED');
 const body=[
  '/* BALL46_SEARCH_SURFACE_DUALMODE_20261024: only search background. */',
  'const __b46NewSearchSurface='+JSON.stringify(css)+';',
  'export default {...__b46SearchSurfaceBefore20261024,async fetch(request,env,ctx){',
  '  const path=new URL(request.url).pathname;',
  "  const target=request.method==='GET'&&(path==='/'||path==='/index.html');",
  '  const response=await __b46SearchSurfaceBefore20261024.fetch.call(__b46SearchSurfaceBefore20261024,request,env,ctx);',
  '  if(!target||response.status!==200)return response;',
  "  if(!String(response.headers.get('content-type')||'').toLowerCase().includes('html'))throw Error('SEARCH_SURFACE_HTML_TYPE_CHANGED');",
  '  const h=await response.text();',
  "  if(h.includes('"+TAG+"')||h.split('</head>').length!==2||!h.includes('b46-search-icon-only-20261024'))throw Error('SEARCH_SURFACE_HTML_DRIFT');",
  '  const updated=h.replace("</head>",__b46NewSearchSurface+"\\n</head>");',
  '  const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");',
  '  headers.set("cache-control","no-cache,must-revalidate");',
  '  headers.set("x-ball46-search-surface","dualmode-20261024");',
  '  return new Response(updated,{status:response.status,statusText:response.statusText,headers});',
  '}};'
 ].join('\n');
 return s.replace('export default {','const __b46SearchSurfaceBefore20261024 = {')+'\n'+body;
}
