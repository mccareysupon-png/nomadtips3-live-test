import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const controller=await readFile(new URL('./controller.js',import.meta.url),'utf8'),css=await readFile(new URL('./light.css',import.meta.url),'utf8');
export function patchProductionHTML(html){const script=/<script id="b46-mobile-v3-script">([\s\S]*?)<\/script>/g,style=/<style id="b46-mobile-v3-style">([\s\S]*?)<\/style>/g;
 const a=[...html.matchAll(script)],b=[...html.matchAll(style)];assert.equal(a.length,1,'MOBILE_SCRIPT_DRIFT');assert.equal(b.length,1,'MOBILE_STYLE_DRIFT');assert(a[0][0].includes('let savedTheme=null;')&&a[0][0].includes("root.setAttribute('data-theme','dark')"),'LEGACY_CONTROLLER_REQUIRED');
 const newScript='<script id="b46-mobile-v3-script">'+controller+'</script>',newStyle=b[0][0].replace('</style>','\n'+css+'</style>');
 const next=html.replace(a[0][0],()=>newScript).replace(b[0][0],()=>newStyle);assert.equal(next.replace(newScript,()=>a[0][0]).replace(newStyle,()=>b[0][0]),html,'UNRELATED_HTML_CHANGED');return next;
}
