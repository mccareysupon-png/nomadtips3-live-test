import assert from'node:assert/strict';
import{createHash}from'node:crypto';
export const W='ball46-production',TAG='b46-search-icon-only-20261024';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const css=[
 '<style id="'+TAG+'">',
 '/* Affects only original homepage status-header desktop search; typing still works. */',
 'body .workspace.singlepage .status-head .b46-live-search,',
 'body .workspace.singlepage .status-head .b46-live-search:focus-within{border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important;}',
 'body .workspace.singlepage .status-head .b46-live-search input::placeholder{color:transparent!important;opacity:0!important;}',
 '</style>'
].join('\n');
export function patchHtml(s){
 assert(!s.includes(TAG),'ALREADY_SEARCH_PATCHED');
 assert.equal(s.split('</head>').length,2,'HEAD_ANCHOR_NOT_UNIQUE');
 assert(s.includes('id="b46-live-header-search-20261018"')&&s.includes('.b46-live-search input::placeholder'),'SEARCH_CSS_ANCHOR_MISSING');
 const updated=s.replace('</head>',css+'\n</head>');
 assert.equal(updated.replace(css+'\n',''),s,'HTML_UNEXPECTED_DIFF');
 return updated;
}
export function patchWorker(source,sha){
 assert.equal(hash(Buffer.from(source)),sha,'ACTIVE_SOURCE_DRIFT');
 assert.equal(source.split('export default {').length,2,'WORKER_DEFAULT_EXPORT_DRIFT');
 const code=[
  '/* BALL46_SEARCH_ICON_ONLY_20261024: homepage visual CSS only. */',
  'const __b46IconStyle='+JSON.stringify(css)+';',
  'export default {...__b46SearchBefore20261024,async fetch(request,env,ctx){',
  "  const path=new URL(request.url).pathname,html=request.method==='GET'&&(path==='/'||path==='/index.html');",
  '  const response=await __b46SearchBefore20261024.fetch.call(__b46SearchBefore20261024,request,env,ctx);',
  '  if(!html||response.status!==200)return response;',
  "  if(!String(response.headers.get('content-type')||'').toLowerCase().includes('html'))throw Error('SEARCH_HTML_CONTENT_TYPE_CHANGED');",
  '  const s=await response.text();',
  "  if(s.includes('"+TAG+"')||s.split('</head>').length!==2)throw Error('SEARCH_HEAD_ANCHOR_CHANGED');",
  '  const updated=s.replace("</head>",__b46IconStyle+"\\n</head>");',
  '  const h=new Headers(response.headers);h.delete("content-length");h.delete("etag");',
  '  h.set("cache-control","no-cache, must-revalidate");',
  '  h.set("x-b46-search-icon-only","20261024");',
  '  return new Response(updated,{status:response.status,statusText:response.statusText,headers:h});',
  '}};'
 ].join('\n');
 return source.replace('export default {','const __b46SearchBefore20261024 = {')+'\n'+code;
}
