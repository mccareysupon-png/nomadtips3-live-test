import assert from'node:assert/strict';
import{createHash}from'node:crypto';
export const EXPECTED='3d9e0ad6-6b23-4abe-9981-4c8d3fbd4eda';
export const W='ball46-production',TAG='b46-pc-sidebar-spacing-20261024';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const css=[
'<style id="'+TAG+'">',
'/* PC-only spacing — leave mobile, row heights, labels, icons & theme untouched */',
'@media(min-width:761px){',
'html body .workspace.singlepage > .left-rail:not(#b46-sidebar-css-specificity-guard) > .rail-card.workspace-brand-card{margin-bottom:0px!important;}',
'html body .workspace.singlepage > .left-rail:not(#b46-sidebar-css-specificity-guard) > .rail-card[data-b46-member-independent="1"]{margin-bottom:0px!important;}',
'html body .workspace.singlepage > .left-rail:not(#b46-sidebar-css-specificity-guard) > .rail-card.b46-mobile-status-menu{margin-bottom:0px!important;}',
'html body .workspace.singlepage > .left-rail:not(#b46-sidebar-css-specificity-guard) > .rail-card.b46-mobile-status-menu > .rail-title{margin-bottom:4px!important;}',
'html body .workspace.singlepage > .left-rail:not(#b46-sidebar-css-specificity-guard) > .rail-card.workspace-stats-card > .rail-title{margin-bottom:2px!important;}',
'}',
'</style>'].join('\n');
export function patchHtml(s){
 assert(!s.includes(TAG),'DUPLICATE_SIDEBAR_PATCH');
 assert(s.includes('data-b46-sidebar="1"'),'SIDEBAR_MISSING');
 assert(s.includes('data-b46-member-independent="1"'),'MEMBER_SELECTOR_CHANGED');
 assert(s.includes('workspace-stats-card'),'STATS_SELECTOR_CHANGED');
 assert.equal(s.split('</head>').length,2,'HEAD_DRIFT');
 const changed=s.replace('</head>',css+'\n</head>');
 assert.equal(changed.replace(css+'\n',''),s,'HTML_SCOPE_CHANGED');
 return changed;
}
export function patchWorker(source,expectedSha){
 assert.equal(hash(Buffer.from(source)),expectedSha,'MAIN_SOURCE_DRIFT');
 const token='export default {';
 const p=source.lastIndexOf(token);
 assert(p>0&&source.indexOf(token)===p,'EXPORT_DRIFT');
 const prefix=source.slice(0,p),rest=source.slice(p).replace(token,'const __b46SidebarOriginal = {');
 return prefix+rest+'\n'+[
 '/* '+TAG+' :  PC-only narrow scope; V8 homepage transformation runs first. */',
 'const __b46SidebarCss='+JSON.stringify(css)+';',
 'export default {...__b46SidebarOriginal,async fetch(request,env,ctx){',
 ' const url=new URL(request.url);',
 " const homepage=request.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html');",
 ' const response=await __b46SidebarOriginal.fetch.call(__b46SidebarOriginal,request,env,ctx);',
 ' if(!homepage||response.status!==200)return response;',
 " if(!String(response.headers.get('content-type')||'').toLowerCase().includes('html'))throw Error('SIDEBAR_RESPONSE_TYPE_DRIFT');",
 ' const html=await response.text();',
 " if(html.includes('"+TAG+"')||!html.includes('data-b46-sidebar=')||html.split('</head>').length!==2)throw Error('SIDEBAR_HOME_HTML_DRIFT');",
 ' const edited=html.replace("</head>",__b46SidebarCss+"\\n</head>");',
 ' const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");',
 ' headers.set("cache-control","no-cache,must-revalidate");',
 ' headers.set("x-b46-pc-sidebar","compact-20261024");',
 ' return new Response(edited,{status:response.status,statusText:response.statusText,headers});',
 '}};'
 ].join('\n');
}
