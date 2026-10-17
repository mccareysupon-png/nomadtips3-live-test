import assert from'node:assert/strict';import{createHash}from'node:crypto';import{readFileSync}from'node:fs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const BASE='41bb107d-ebb7-482a-b237-af3c006f21d5',SCRIPT='ball46-production';
export const ORIGINAL_KITS='ee7084e051d455af5959df298e65ee940019b7f51c6ad4c8f1ff9c37a404e5e6',CANDIDATE_KITS=ORIGINAL_KITS;
export const ORIGINAL_HTML='bd6d5386d750403d1d28c0dbb622c37b8adfec2db2523d1a5de77edda7dfb073';
export function validateCss(css){
 assert(!/@import|url\s*\(|<\/?(?:script|style)/i.test(css),'UNEXPECTED_CSS_RESOURCE');
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,''),allowed=new Set(['background-color','background-image','color','border-color','box-shadow','caret-color']);let rules=0;
 for(const [,selectors,body]of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)){rules++;for(const selector of selectors.split(',')){const s=selector.trim();assert(s.startsWith('html:root[data-theme="light"] '),'NOT_LIGHT_ONLY:'+s);assert(s.includes('#ball46-daily-performance')||s.includes('.workspace-stable-toolbar-host .search-box'),'OUT_OF_SCOPE_SELECTOR:'+s);}for(const declaration of body.split(';').map(x=>x.trim()).filter(Boolean)){const property=declaration.slice(0,declaration.indexOf(':')).trim();assert(allowed.has(property),'NON_COLOR_PROPERTY:'+property);}}
 assert(rules>0,'CSS_EMPTY');return{rules,allowedProperties:[...allowed]};
}
export function patchLightTheme(html){
 assert.equal(sha(html),ORIGINAL_HTML,'ACTIVE_HTML_DRIFT');assert(!html.includes('b46-light-theme-repair-20261017'),'ALREADY_PATCHED');assert.equal(html.split('</head>').length-1,1,'HEAD_ANCHOR_COUNT');
 const css=readFileSync(new URL('./light-theme.css',import.meta.url),'utf8'),guard=validateCss(css),block='\n<style id="b46-light-theme-repair-20261017">\n'+css+'\n</style>\n';
 const result=html.replace('</head>',block+'</head>');assert.equal(result.replace(block,''),html,'UNRELATED_HTML_CHANGED');
 return{html:result,css,block,guard};
}
