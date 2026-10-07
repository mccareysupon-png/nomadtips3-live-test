import { inspect, publicFile, activeVersion } from '../daily-performance-20261005/production.mjs';

const base = await inspect();
console.log('ACTIVE='+base.restore.version);
const files = new Set(['index.html']);
const html = (await publicFile('/index.html')).toString('utf8');
for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
  const s=m[1].split('?')[0];
  if (s.startsWith('/') || !s.includes('://')) files.add(s.replace(/^\.\//,'').replace(/^\//,''));
}
console.log('LOCAL_SCRIPTS='+JSON.stringify([...files]));

const needles = [
  'MATCH STATUS','STATISTICS','STATISTIC','scrollTo','scrollY','scrollTop',
  'pushState','replaceState','popstate','hashchange','data-view','data-page',
  'match-status','statistics'
];

for (const f of files) {
  let text;
  try { text = f==='index.html' ? html : (await publicFile('/'+f)).toString('utf8'); }
  catch(e){ console.log('FETCH_FAIL '+f+' '+e.message); continue; }
  console.log('\n===FILE '+f+' bytes='+Buffer.byteLength(text)+'===');
  for (const needle of needles) {
    let from=0,count=0;
    while (count<12) {
      const idx=text.toLowerCase().indexOf(needle.toLowerCase(),from);
      if(idx<0) break;
      const a=Math.max(0,idx-420), b=Math.min(text.length,idx+needle.length+700);
      console.log('\n--- '+needle+' @'+idx+' ---\n'+text.slice(a,b).replace(/\n/g,' '));
      from=idx+needle.length; count++;
    }
  }
}
console.log('ACTIVE_END='+await activeVersion());
