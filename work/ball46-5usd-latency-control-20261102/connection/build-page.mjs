import{readFile}from'node:fs/promises';
export async function page(){let html=await readFile(new URL('manual-page.html',import.meta.url),'utf8');return html.replace('/*__STYLE__*/',await readFile(new URL('../preview.css',import.meta.url),'utf8')).replace('/*__CLIENT__*/',await readFile(new URL('manual-client.js',import.meta.url),'utf8'));}
