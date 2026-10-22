const paths=['/dashboard-v2-stage3-featured-facts-20261013a.js','/expanded-match-343.js'];
for(const p of paths){
 const r=await fetch('https://ball46.com'+p+'?v13_source='+Date.now());
 const text=await r.text();console.log('SOURCE_META',JSON.stringify({p,status:r.status,len:text.length}));
 const terms=p.startsWith('/dashboard')?['function setText(', 'const setText=', 'function renderFeatured(){','function patchFeatureSignalHost','function featureFactsHtml','function statHtml(', 'function eventsHtml(']:
 ['data-featured','feature-stats','feature-facts','innerHTML','cloneNode','MutationObserver'];
 for(const term of terms){const i=text.indexOf(term);if(i>=0)console.log('SOURCE_SECTION',JSON.stringify({p,term,at:i,code:text.slice(Math.max(0,i-150),Math.min(text.length,i+(term==='function renderFeatured(){'?2300:1900)))}));}
}