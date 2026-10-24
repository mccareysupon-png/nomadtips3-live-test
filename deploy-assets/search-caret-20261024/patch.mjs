import assert from'node:assert/strict';
import{createHash}from'node:crypto';
export const W='ball46-production',TAG='b46-search-caret-green-20261024';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const css=[
 '<style id="'+TAG+'">',
 '/* Caret paint ONLY; preserve background, border, placeholder and search input. */',
 'html body .workspace.singlepage .status-head .b46-live-search input,',
 'html body .workspace.singlepage .status-head .b46-live-search input:focus{caret-color:#00e676!important;}',
 '</style>'
].join('\n');
export function patchHtml(s){
 assert(!s.includes(TAG),'ALREADY_PATCHED');
 assert.equal(s.split('</head>').length,2,'HEAD_DRIFT');
 assert(s.includes('id="b46-search-surface-dualmode-20261024"'),'PREVIOUS_SEARCH_STYLE_MISSING');
 const next=s.replace('</head>',css+'\n</head>');
 assert.equal(next.replace(css+'\n',''),s,'UNEXPECTED_HTML_DIFF');
 return next;
}
export function patchWorker(s,expectedSha){
 assert.equal(hash(Buffer.from(s)),expectedSha,'WORKER_SOURCE_DRIFT');
 assert.equal(s.split('export default {').length,2,'EXPORT_ANCHOR_DRIFT');
 const lines=[
  '/* B46_GREEN_SEARCH_CARET_20261024 only wraps homepage HTML. */',
  'const __b46CaretStyle='+JSON.stringify(css)+';',
  'export default {...__b46CaretBase,async fetch(request,env,ctx){',
  '  const path=new URL(request.url).pathname;',
  "  const target=request.method==='GET'&&(path==='/'||path==='/index.html');",
  '  const resp=await __b46CaretBase.fetch.call(__b46CaretBase,request,env,ctx);',
  '  if(!target||resp.status!==200)return resp;',
  "  if(!String(resp.headers.get('content-type')||'').toLowerCase().includes('html'))throw Error('CARET_HTML_MIME_DRIFT');",
  '  const h=await resp.text();',
  "  if(h.includes('"+TAG+"')||h.split('</head>').length!==2||!h.includes('b46-search-surface-dualmode-20261024'))throw Error('CARET_HTML_DRIFT');",
  '  const updated=h.replace("</head>",__b46CaretStyle+"\\n</head>");',
  '  const head=new Headers(resp.headers);head.delete("content-length");head.delete("etag");',
  '  head.set("cache-control","no-cache,must-revalidate");',
  '  head.set("x-b46-caret","green-20261024");',
  '  return new Response(updated,{status:resp.status,statusText:resp.statusText,headers:head});',
  '}};'
 ].join('\n');
 return s.replace('export default {','const __b46CaretBase = {')+'\n'+lines;
}
