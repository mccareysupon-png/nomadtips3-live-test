import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
export async function mobilePalette(){
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,protocolTimeout:45000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 try {
 const p=await browser.newPage();await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await p.setCacheEnabled(false);
 await p.goto('https://ball46.com/index.html?view=statistics&market=all&b46QA='+process.env.GITHUB_RUN_ID+'-palette',{waitUntil:'domcontentloaded',timeout:45000});
 await p.waitForSelector('aside.left-rail[data-b46-sidebar="1"] button[data-league-filter]',{timeout:30000});
 const snap=await p.evaluate(()=>{const a=document.querySelector('aside.left-rail[data-b46-sidebar="1"]');const css=[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n');return {side:a.outerHTML,css,rootClass:document.documentElement.className}});
 await p.close();const q=await browser.newPage();await q.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await q.setContent('<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+snap.css.replace(/@import[^;]+;/gi,'')+'</style></head><body data-workspace-view="statistics"><main class="dash-shell"><section class="workspace singlepage">'+snap.side.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')+'</section></main></body></html>',{waitUntil:'domcontentloaded'});
 await q.evaluate(cls=>{document.documentElement.className=cls},snap.rootClass);
 const palette=await q.evaluate(()=>{
 const rows=[...document.querySelectorAll('aside.left-rail[data-b46-sidebar="1"] :is([data-b46-sidebar-row],button[data-league-filter],a[data-b46-member-entry="rail"])')];
 for(const e of rows){e.classList.remove('active');e.removeAttribute('aria-current');e.removeAttribute('aria-pressed')}
 const out={};
 for(const theme of ['dark','light']){
 document.documentElement.dataset.theme=theme;out[theme]={};
 for(const view of ['statistics','live']){
 document.body.dataset.workspaceView=view;const entries={};out[theme][view]=entries;
 for(const e of rows){
 const key=e.dataset.b46SidebarRow||(e.hasAttribute('data-league-filter')?'league':'member'),b=e.querySelector(':scope > b'),icon=e.querySelector('svg.b46-menu-icon'),color=x=>x?getComputedStyle(x).color:null;
 const ink=color(e);let count=color(b)||ink,zero=count;
 if(b?.hasAttribute('data-b46-zero')){const orig=b.getAttribute('data-b46-zero');b.setAttribute('data-b46-zero','0');count=color(b);b.setAttribute('data-b46-zero','1');zero=color(b);b.setAttribute('data-b46-zero',orig)}
 const value={ink,count,zero,icon:color(icon)||ink};
 if(entries[key]&&JSON.stringify(entries[key])!==JSON.stringify(value))throw Error('NONUNIFORM_MOBILE_PALETTE '+key);
 entries[key]=value;
 }
 }
 }
 return out;
 });
 const lines=['/* Mobile-only palette: original non-selected colors read from the production CSS before applying approved V2. */','@media (max-width: 767px) {'];for(const [theme,views] of Object.entries(palette))for(const [view,entries]of Object.entries(views)){
 assert.equal(Object.keys(entries).filter(k=>k.startsWith('stat-')).length,8);
 assert.equal(Object.keys(entries).filter(k=>k.startsWith('status-')).length,6);
 for(const [key,r]of Object.entries(entries)){
 const row=key==='league'?'button[data-league-filter]':key==='member'?'a[data-b46-member-entry="rail"]':'[data-b46-sidebar-row="'+key+'"]';
 for(const value of Object.values(r))assert(/^rgb\(\d+, \d+, \d+\)$/.test(value),'PALETTE '+value);
 lines.push('html:root[data-theme="'+theme+'"] body[data-workspace-view="'+view+'"] .workspace.singlepage > aside.left-rail[data-b46-sidebar="1"] '+row+'{--b46-menu-normal:'+r.ink+';--b46-menu-count:'+r.count+';--b46-menu-count-zero:'+r.zero+';--b46-menu-rate-neutral:'+r.ink+';--b46-menu-icon:'+r.icon+';}');
 }
 }
 // Signal/mobile views use the live palette if they have a matching sidebar; avoid modifying other UI.
 for(const [theme,views]of Object.entries(palette))for(const [key,r]of Object.entries(views.live)){const row=key==='league'?'button[data-league-filter]':key==='member'?'a[data-b46-member-entry="rail"]':'[data-b46-sidebar-row="'+key+'"]';lines.push('html:root[data-theme="'+theme+'"] body:not([data-workspace-view="statistics"]) .workspace.singlepage > aside.left-rail[data-b46-sidebar="1"] '+row+'{--b46-menu-normal:'+r.ink+';--b46-menu-count:'+r.count+';--b46-menu-count-zero:'+r.zero+';--b46-menu-rate-neutral:'+r.ink+';--b46-menu-icon:'+r.icon+';}')}
 lines.push('}');const css='\n'+lines.join('\n')+'\n';fs.writeFileSync('evidence/mobile-original-palette.json',JSON.stringify(palette,null,2));fs.writeFileSync('evidence/mobile-palette.css',css);console.log('MOBILE_PALETTE_PASS '+JSON.stringify({darkTotal:palette.dark.statistics['stat-all'],lightTotal:palette.light.statistics['stat-all'],groups:Object.keys(palette.dark.statistics).length}));return css;
 }finally{await browser.close()}
}
