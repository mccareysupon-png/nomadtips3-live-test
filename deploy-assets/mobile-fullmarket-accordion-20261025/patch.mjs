import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const PRODUCTION_BASE='15607595-5930-4093-8e9e-e64c52d9f120';
export const MAIN_SHA='d6f5eb24ef9c666839f4c9c56ee3fe9ad4c4fb545915e6b5ed886638b64df72e';
export const ORIGINAL_HTML_SHA='d554a64786ea66aae1051f6f288683b87844cfb738bacaa85ba44446f860239c';
export const MARK='B46_MOBILE_FULLMARKET_ACCORDION_20261025';
export const BROWSER_ROUTE='/mobile-fullmarket-accordion-20261025.js';
export const sha=v=>createHash('sha256').update(v).digest('hex');

const LAST5_EXPORT='export default{...__last5Previous,async fetch(';
export function patchMain(source,expectedSHA=MAIN_SHA){
  assert.equal(sha(source),expectedSHA,'PRODUCTION_SOURCE_DRIFT');
  assert.equal(source.split(LAST5_EXPORT).length,2,'UNEXPECTED_LAST5_WRAPPER_LAYOUT');
  assert(!source.includes('b46-mobile-fm-browser.mjs'),'ALREADY_PATCHED');
  const importLine='import{mobileMarketBrowser as __b46FmBrowser}from"./b46-mobile-fm-browser.mjs";\n';
  const renamed=source.replace(LAST5_EXPORT,'const __b46FmOriginal={...__last5Previous,async fetch(');
  const wrapper=[
    'export default{...__b46FmOriginal,async fetch(request,env,ctx){',
    'const pathname=new URL(request.url).pathname;',
    'if(request.method==="GET"&&pathname==="/mobile-fullmarket-accordion-20261025.js"){',
    'return new Response(__b46FmBrowser,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-cache, must-revalidate","x-ball46-mobile-fm":"accordion-v1"}});}',
    'const response=await __b46FmOriginal.fetch.call(__b46FmOriginal,request,env,ctx);',
    'if(request.method!=="GET"||(pathname!=="/"&&pathname!=="/index.html")||!response.ok||!(response.headers.get("content-type")||"").includes("text/html"))return response;',
    'const html=await response.text();',
    'if(html.split("</body>").length!==2)throw Error("MOBILE_FULLMARKET_HTML_DRIFT");',
    'if(html.includes("/mobile-fullmarket-accordion-20261025.js"))throw Error("MOBILE_FULLMARKET_ALREADY_INSTALLED");',
    'const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("cache-control","no-cache, must-revalidate");',
    'return new Response(html.replace("</body>","<script defer src=\\"/mobile-fullmarket-accordion-20261025.js\\"></script></body>"),{status:response.status,statusText:response.statusText,headers});',
    '}};'
  ].join('\n');
  return importLine+renamed+'\n'+wrapper+'\n';
}
export function browserModule(browserJS){
  assert(browserJS.includes('__b46MobileFmAccordion20261025'),'BROWSER_MARKER_MISSING');
  assert(!/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b/.test(browserJS),'UNEXPECTED_BROWSER_NETWORK');
  return 'export const mobileMarketBrowser='+JSON.stringify(browserJS)+';\n';
}
