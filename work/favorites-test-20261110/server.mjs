import{createServer}from'node:http';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
const ROOT=new URL('./',import.meta.url),sha=s=>createHash('sha256').update(s).digest('hex');
export async function createPreviewServer(port=0){
 const audit=JSON.parse(await readFile(new URL('fresh/report.json',ROOT))),snapshot=JSON.parse(await readFile(new URL('fresh/preview-snapshot.json',ROOT)).catch(()=>readFile(new URL('fresh/snapshot.json',ROOT)))),files=new Map(),requests=[];
 for(const f of audit.files)files.set(f.path,{...f,body:await readFile(new URL('fresh/'+sha(f.path)+'.txt',ROOT))});
 const apiFiles={'/favorites.js':'favorites.js','/favorites.css':'favorites.css','/favorites-dashboard.js':'candidate/dashboard.js','/favorites-workspace.js':'candidate/workspace.js'};
 const server=createServer(async(req,res)=>{const u=new URL(req.url,'http://127.0.0.1');try{
 if(u.pathname==='/__test/update'){const f=snapshot.fixtures.find(f=>String(f.fixtureId)===u.searchParams.get('id'));if(f){f.goals={...f.goals,home:Number(u.searchParams.get('home'))};f.minute=Number(f.minute||0)+1}res.writeHead(200,{'content-type':'application/json'});return res.end('{"ok":true}')}
 if(u.pathname.startsWith('/api/')){requests.push(u.pathname);let data;if(['/api/engine/board','/api/hub/snapshot'].includes(u.pathname))data={...snapshot,cacheOnly:true,externalRequestsAdded:0,stale:false};else if(u.pathname==='/api/engine/signals')data={ok:true,signals:[],mirror:{activeMatches:0}};else data={ok:false,error:'UNRELATED_READ_ISOLATED_FOR_FAVORITES_TEST',rows:[],externalRequestsAdded:0};res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(data))}
 if(['/','/index.html'].includes(u.pathname)){let html=await readFile(new URL('candidate/index.html',ROOT),'utf8');html=html.replace('</body>','<aside style="position:fixed;bottom:6px;right:8px;z-index:99999;background:#123729;color:#fff;padding:5px 9px;border-radius:6px;font:10px system-ui;pointer-events:none">TEST PREVIEW · recorded data · Production unchanged</aside></body>');res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});return res.end(html)}
 if(apiFiles[u.pathname]){const body=await readFile(new URL(apiFiles[u.pathname],ROOT));res.writeHead(200,{'content-type':u.pathname.endsWith('.css')?'text/css':'text/javascript','cache-control':'no-store'});return res.end(body)}
 const f=files.get(u.pathname+u.search);if(f){res.writeHead(200,{'content-type':f.headers['content-type']||'text/javascript','cache-control':'no-store'});return res.end(f.body)}
 if(/\.(?:webp|png|jpg|jpeg|svg|woff2?|ico|css|js)$/.test(u.pathname)||u.pathname.startsWith('/cf-fonts/')){res.writeHead(302,{location:'https://ball46.com'+u.pathname+u.search});return res.end()}
 res.writeHead(404);res.end('Preview resource unavailable');
 }catch(e){res.writeHead(500);res.end(String(e.message))}});
 await new Promise(r=>server.listen(port,'127.0.0.1',r));return{server,url:'http://127.0.0.1:'+server.address().port,snapshot,requests,audit};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const p=await createPreviewServer(8835);console.log('FAVORITES_TEST_PREVIEW '+p.url)}