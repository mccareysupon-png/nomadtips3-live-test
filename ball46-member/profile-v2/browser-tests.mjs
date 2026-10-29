import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const server=spawn(process.execPath,['ball46-member/profile-v2/test-server.mjs'],{stdio:['ignore','pipe','pipe']});
let browser;
try{
 for(let attempt=0;attempt<30;attempt++){try{if((await fetch('http://127.0.0.1:8766/member?view=profile')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,300));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:8766/member?view=profile');
 await page.getByRole('button',{name:/Edit profile/}).click();
 await page.getByLabel('Display name',{exact:true}).fill('สมาชิกทดสอบ');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#profileName').textContent==='สมาชิกทดสอบ');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#profileName').textContent==='สมาชิกทดสอบ');
 await page.locator('#photoInput').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwBfKQHawPxjCj0MYLMBt1tlfN1zQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1owWMXrb5w8VV9AxwAAAAASUVORK5CYII=','base64')});
 await page.waitForFunction(()=>document.querySelector('#avatar img')?.complete);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#avatar img')?.complete);
 await page.getByRole('button',{name:'Remove',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#avatar img'));
 await page.getByRole('tab',{name:'Preferences',exact:true}).click();
 await page.getByRole('combobox',{name:'Preferred time zone',exact:true}).selectOption('UTC');
 await page.getByRole('switch',{name:'Reduced motion',exact:true}).click();
 await page.getByRole('button',{name:'Save preferences',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#preferenceStatus').textContent==='Your preferences have been saved.');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#profileName').textContent==='สมาชิกทดสอบ');
 await page.getByRole('tab',{name:'Preferences',exact:true}).click();
 assert.equal(await page.locator('#timezone').inputValue(),'UTC');
 assert.equal(await page.locator('#motion').getAttribute('aria-checked'),'true');
 await page.getByRole('tab',{name:'Security',exact:true}).click();
 assert.equal(await page.locator('#securityEmail').textContent(),'test-member@example.test');
 await page.getByRole('tab',{name:'Profile',exact:true}).click();
 mkdirSync('audit/member-profile-v2-20261029',{recursive:true});
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});const measure=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert(measure.scroll<=measure.width,'PROFILE_HORIZONTAL_OVERFLOW '+width);await page.screenshot({path:'audit/member-profile-v2-20261029/profile-'+width+'.png',fullPage:true});}
 assert.deepEqual(errors,[],'BROWSER_ERRORS');
 console.log('PROFILE_BROWSER_TESTS_PASSED name-save-reload avatar-save-reload-remove preferences-reload security five-viewports');
}finally{await browser?.close();server.kill();}

