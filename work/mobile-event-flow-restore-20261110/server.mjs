import{createServer}from'node:http';import{readFile}from'node:fs/promises';
const base=new URL('./',import.meta.url),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml'};
const routes={'/':'preview.html','/preview.js':'preview.js','/frozen.json':'source/frozen-current-fixture.json','/b46-mobile-event-flow-bars-20261102.js':'source/b46-mobile-event-flow-bars-20261102.js'};
for(const k of['goal','corner','yellow','red'])routes['/b46-mobile-flow-icon-'+k+'-20261102.svg']='assets/'+k+'.svg';
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname,file=routes[path];if(!file){res.writeHead(404);res.end();return}try{const b=await readFile(new URL(file,base));res.writeHead(200,{'content-type':types[file.slice(file.lastIndexOf('.'))]||'application/octet-stream','cache-control':'no-store'});res.end(b)}catch(e){res.writeHead(500);res.end('Preview asset unavailable')}});
server.listen(8830,'127.0.0.1',()=>console.log('MOBILE_BAR_RESTORE_PREVIEW http://127.0.0.1:8830/'));

