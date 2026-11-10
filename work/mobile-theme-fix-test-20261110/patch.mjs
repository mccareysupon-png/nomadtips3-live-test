import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const controller=await readFile(new URL('./controller.js',import.meta.url),'utf8'),css=await readFile(new URL('./light.css',import.meta.url),'utf8');
export function patchHTML(html){const pattern=/<script id="b46-mobile-v3-script">([\s\S]*?)<\/script>/g,matches=[...html.matchAll(pattern)];assert.equal(matches.length,1,'MOBILE_CONTROLLER_SOURCE_DRIFT');const old=matches[0][0];assert(old.includes("root.setAttribute('data-theme','dark')")&&old.includes('let savedTheme=null;'),'MOBILE_CONTROLLER_CONTRACT_DRIFT');assert.equal(html.split('</head>').length,2);
 const replacement='<script id="b46-mobile-v3-script">'+controller+'</script>',style='<style id="b46-mobile-theme-preference-20261110">'+css+'</style>';
 const next=html.replace(old,()=>replacement).replace('</head>',style+'</head>');assert.equal(next.replace(replacement,()=>old).replace(style,''),html,'UNRELATED_HTML_CHANGED');return next;
}
