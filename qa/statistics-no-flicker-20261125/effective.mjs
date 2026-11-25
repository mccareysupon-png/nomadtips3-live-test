const origin='https://ball46.com';
const paths=['/longterm-performance-343.js','/singlepage-workspace-343.js','/b46-statistics-fast-v1-20261116.js'];
for(const path of paths){
 const r=await fetch(origin+path+'?audit='+Date.now(),{cache:'no-store'}),s=await r.text();
 const terms=path.includes('longterm')?['function renderFromStats','function render(', 'shell.innerHTML','function bindCard','function bindChart','function ensureCard','ResizeObserver','function render()']:['sp-stats-content','innerHTML=','replaceChildren(','b46-finance-chart-card'];
 const findings=terms.map(term=>{const samples=[];let p=0,count=0;while((p=s.indexOf(term,p))>=0){count++;if(samples.length<6)samples.push({at:p,code:s.slice(Math.max(0,p-450),p+1700)});p+=term.length}return {term,count,samples}}).filter(x=>x.count);
 console.log('B46_STAT_ACTUAL_JS '+JSON.stringify({path,status:r.status,bytes:s.length,findings}));
}
