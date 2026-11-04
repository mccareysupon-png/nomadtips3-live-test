import{createServer}from'node:http';import{readFile}from'node:fs/promises';
const root=new URL('./',import.meta.url),started=Date.now(),port=8825;
const before=await readFile(new URL('stage/current.html',root),'utf8'),js=await readFile(new URL('stage/dashboard-after.js',root),'utf8');
const main=/src=["'](?:https:\/\/ball46\.com\/)?\/?dashboard-v2-stage3-featured-facts-20261013a\.js[^"']*["']/;
let html=before.replace(main,'src="http://127.0.0.1:'+port+'/dashboard-test.js"').replace(/\b(src|href)=(["'])([^"']+)\2/g,(all,attr,quote,url)=>/\.(?:js|css|webp|png|jpg|jpeg|svg|woff2?)(?:\?|$)/i.test(url)&&!url.startsWith('http://127.0.0.1:')?attr+'='+quote+new URL(url,'https://ball46.com/').href+quote:all);
html=html.replace('<body','<body').replace(/(<body[^>]*>)/,'$1<div style="position:fixed;z-index:2147483647;bottom:8px;left:8px;right:8px;padding:8px 12px;background:#fff4ce;color:#3d3100;border-radius:8px;text-align:center;font:12px Arial">ชุดทดสอบ 5 วินาที · ข้อมูลจำลอง ไม่ใช่การแข่งขันจริง · ไม่มีการเรียก 5USD</div>');
function f(){const step=Math.floor((Date.now()-started)/10000)%4,home=[0,1,0,2][step];return{fixtureId:'screen-test-1',home:{name:'Display Home'},away:{name:'Display Away'},league:{name:'ISOLATED SCREEN TEST'},kickoffAt:started-3600000,boardState:'live',status:'Live',statusCode:'2H',minute:60+Math.floor((Date.now()-started)/5000)%30,goals:{home,away:0,halfHome:0,halfAway:0},providerOdds:{}}}
const baseline=f();
createServer(async(req,res)=>{
const u=new URL(req.url,'http://127.0.0.1:'+port);res.setHeader('cache-control','no-store');
if(u.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);}
if(u.pathname==='/dashboard-test.js'){res.setHeader('content-type','text/javascript');return res.end(js);}
if(u.pathname.startsWith('/api/')){let j={ok:true,fixtures:[],signals:[],rows:[],ledgerRows:[],ledgerTotal:0,nextCursor:null,entries:{},markets:[],bookmakers:[],externalRequestsAdded:0};
if(u.pathname==='/api/engine/board')j={ok:true,fetchedAt:started,hubFetchedAt:started,fixtures:[baseline],counts:{live:1}};
if(u.pathname==='/api/hub/snapshot')j={ok:true,cacheOnly:true,externalRequestsAdded:0,fetchedAt:Date.now(),liveFetchedAt:Date.now(),fixtures:[f()]};
res.setHeader('content-type','application/json');return res.end(JSON.stringify(j));}
if(/\.(?:js|css|webp|png|jpg|jpeg|svg|woff2?)$/.test(u.pathname)){res.writeHead(302,{location:'https://ball46.com'+u.pathname+u.search});return res.end();}
res.statusCode=404;res.end('Not found');
}).listen(port,'127.0.0.1',()=>console.log('Isolated test preview: http://127.0.0.1:'+port+'/?status=live'));


