const { chromium } = require('playwright');

(async()=>{
  const base = process.env.TARGET_URL;
  if(!base) throw new Error('TARGET_URL missing');
  const browser = await chromium.launch({headless:true});
  const pages = [
    ['index.html','.shell'],
    ['signal.html','.shell'],
    ['statistics.html','.shell'],
    ['settings.html','.owner-shell'],
  ];
  const viewports = [
    {width:1920,height:1000,name:'desktop-xl'},
    {width:1366,height:900,name:'laptop'},
    {width:1024,height:800,name:'tablet-landscape'},
    {width:768,height:900,name:'tablet'},
    {width:390,height:844,name:'mobile'},
  ];
  for(const vp of viewports){
    for(const [path,selector] of pages){
      const page = await browser.newPage({viewport:{width:vp.width,height:vp.height}});
      await page.goto(`${base}/${path}?fullwidth=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:45000});
      const target = page.locator(selector);
      await target.waitFor({state:'visible',timeout:15000});
      const result = await target.evaluate((el)=>{
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const top = document.querySelector('.topbar-inner');
        const tr = top?.getBoundingClientRect();
        const tcs = top ? getComputedStyle(top) : null;
        return {
          left:r.left,rightGap:innerWidth-r.right,width:r.width,viewport:innerWidth,maxWidth:cs.maxWidth,
          topLeft:tr?.left??null,topRightGap:tr?innerWidth-tr.right:null,topWidth:tr?.width??null,topMaxWidth:tcs?.maxWidth??null,
          scrollWidth:document.documentElement.scrollWidth
        };
      });
      const edgeAllowance = vp.width <= 760 ? 6 : 18;
      if(result.maxWidth !== 'none') throw new Error(`${vp.name} ${path} SHELL_MAX_WIDTH ${JSON.stringify(result)}`);
      if(result.left > edgeAllowance || result.rightGap > edgeAllowance) throw new Error(`${vp.name} ${path} SHELL_NOT_FULL ${JSON.stringify(result)}`);
      if(result.width < vp.width - edgeAllowance*2) throw new Error(`${vp.name} ${path} SHELL_TOO_NARROW ${JSON.stringify(result)}`);
      if(result.topMaxWidth !== 'none') throw new Error(`${vp.name} ${path} TOPBAR_MAX_WIDTH ${JSON.stringify(result)}`);
      if((result.topLeft??0) > edgeAllowance || (result.topRightGap??0) > edgeAllowance) throw new Error(`${vp.name} ${path} TOPBAR_NOT_FULL ${JSON.stringify(result)}`);
      if(result.scrollWidth > vp.width + 2) throw new Error(`${vp.name} ${path} ROOT_HORIZONTAL_OVERFLOW ${JSON.stringify(result)}`);
      console.log('FULL WIDTH OK',vp.name,path,result);
      await page.close();
    }
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
