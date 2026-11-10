const r=await fetch('https://ball46.com/full-market-bookmaker-343.js?lazyprod='+Date.now(),{headers:{'cache-control':'no-cache'}});
const t=await r.text();
console.log('HTTP='+r.status);
for(const key of ['function inspectFixture(f)','function renderBookHtml(f','function shellHtml(','function update(expanded,fixture)','function chooseBook(','data-fmb-book','panel.innerHTML=renderBookHtml','let active=','const active=','selectedBook']){
 let p=0,c=0;
 while(true){const i=t.indexOf(key,p);if(i<0)break;console.log('\nKEY='+key+' POS='+i+'\n'+t.slice(Math.max(0,i-2200),Math.min(t.length,i+9000)));p=i+key.length;if(++c>=4)break;}
}
