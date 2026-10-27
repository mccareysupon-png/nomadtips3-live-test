// Read-only CSS origin diagnostics using public HTML; do not print complete HTML or scripts.
const base='https://www.ball46.com/';
const r=await fetch(base,{signal:AbortSignal.timeout(25000)});
const html=await r.text();
const patterns=['#071518','#25d59e','#15945a','#f4f7f5','--surface-2','b46m-header','data-theme','@media(max-width','@media (max-width','@media screen and (max-width','--b46m-surface'];
const found=[];
for(const token of patterns){
 const matches=[];
 let i=-1;
 while((i=html.toLowerCase().indexOf(token.toLowerCase(),i+1))>=0 && matches.length<9){
   matches.push({index:i,context:html.slice(Math.max(0,i-300),Math.min(html.length,i+400)).replace(/\s+/g,' ').slice(0,730)});
 }
 found.push({token,countAtLeast:matches.length,matches});
}
const attrs=[...html.matchAll(/<html\b[^>]*>|<body\b[^>]*>|<meta[^>]*name=["']color-scheme["'][^>]*>/ig)].map(x=>x[0].slice(0,320));
console.log('BALL46_THEME_CSS_ORIGINS='+JSON.stringify({date:new Date().toISOString(),http:r.status,htmlBytes:html.length,attrs,found}));
