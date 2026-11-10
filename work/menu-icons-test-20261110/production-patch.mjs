import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const js=await readFile(new URL('./icons.js',import.meta.url),'utf8'),css=await readFile(new URL('./icons.css',import.meta.url),'utf8');
export const addition='<style id="b46-menu-icons-20261110">'+css+'</style><script id="b46-menu-icons-20261110-script">'+js+'</script>';
export function patchProductionHTML(html){
 assert(!html.includes('id="b46-menu-icons-20261110"'),'ALREADY_PATCHED');
 const matches=[...html.matchAll(/<script id="b46-mobile-v3-script">[\s\S]*?<\/script>/g)];
 assert.equal(matches.length,1,'MOBILE_ANCHOR_DRIFT');
 const anchor=matches[0][0],next=html.replace(anchor,()=>anchor+addition);
 assert.equal(next.replace(addition,''),html,'UNRELATED_HTML_CHANGED');return next;
}
