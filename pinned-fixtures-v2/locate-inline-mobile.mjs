const html=await (await fetch('https://ball46.com/?pinv2-inline='+Date.now(),{headers:{'cache-control':'no-cache'}})).text();
console.log('HTML_LEN='+html.length);
for(const term of ['data-b46gn-fixture','b46gn-card','b46gn-detail','B46_MOBILE_V3','mobileCards','renderMobile','fixtureId']){
 let from=0,count=0;
 while(count<6){
  const i=html.indexOf(term,from); if(i<0)break;
  console.log('\nTERM='+term+' POS='+i+'\n'+html.slice(Math.max(0,i-3500),Math.min(html.length,i+9000))+'\n---');
  from=i+term.length; count++;
 }
}
console.log('PIN_V2_INLINE_LOCATOR_DONE=1');