const urls=['https://member.ball46.com/','https://member.ball46.com/login'];
for(const url of urls){
 const r=await fetch(url,{headers:{'user-agent':'BALL46-readonly-audit/1.0'},signal:AbortSignal.timeout(30000)});
 const t=await r.text();
 console.log('URL='+url+' STATUS='+r.status+' LEN='+t.length);
 const terms=['Favorites','Favorite','Win Rate','WIN RATE','P/L TODAY','P/L','Today','TOTAL','1X2','AH','O/U','Corners','BTTS','Cards','Other','login','email','password','otp','magic','member center','Member Center','pricing'];
 for(const x of terms){
   const i=t.toLowerCase().indexOf(x.toLowerCase());
   console.log('TERM='+x+' FOUND='+(i>=0?'1':'0')+(i>=0?' CTX='+t.slice(Math.max(0,i-350),Math.min(t.length,i+x.length+1000)).replace(/\s+/g,' '):''));
 }
}
