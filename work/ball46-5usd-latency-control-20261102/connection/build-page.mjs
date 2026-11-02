import{readFile}from'node:fs/promises';
export async function page(){const html=await readFile(new URL('manual-page.html',import.meta.url),'utf8'),css=await readFile(new URL('../preview.css',import.meta.url),'utf8'),client=await readFile(new URL('manual-client.js',import.meta.url),'utf8');return html.replace('/*__STYLE__*/',()=>css).replace('/*__CLIENT__*/',()=>client);}
