import { chromium } from 'playwright';
const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
function marketRow(block,company){
  const esc=company.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),line='([+\\-]?[0-9./]+)',num='([0-9.]+)';
  const rx=new RegExp(`${esc}\\s+Initial\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+${line}\\s+${num}\\s+${num}\\s+${line}\\s+${num}([\\s\\S]{0,300}?)\\bLive\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+${line}\\s+${num}\\s+${num}\\s+${line}\\s+${num}`,'i');
  const m=block.match(rx);if(!m)return null;
  return {opening:{oneX2:{home:+m[1],draw:+m[2],away:+m[3]},totals:{over:+m[4],line:m[5],under:+m[6]},asian:{home:+m[7],line:m[8],away:+m[9]}},current:{oneX2:{home:+m[11],draw:+m[12],away:+m[13]},totals:{over:+m[14],line:m[15],under:+m[16]},asian:{home:+m[17],line:m[18],away:+m[19]}}};
}
function parseMarket(text){const block=String(text||'').match(/Live Odds Comparison([\s\S]{0,4500})/i)?.[1]||'';for(const c of ['Bet365','Crown','Sbobet']){const r=marketRow(block,c);if(r)return r}return null}
function strength(text){const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean),i=lines.findIndex(x=>/^Strength Comparison$/i.test(x));if(i<0)return null;const nums=[];for(let j=i+1;j<Math.min(lines.length,i+10);j++)if(/^\d{1,3}%?$/.test(lines[j]))nums.push(Number(lines[j].replace('%','')));return nums.length>=2?{home:nums[0],away:nums[1]}:null}
function h2h(text){const block=String(text||'').match(/H2H Comparison([\s\S]{0,1800}?)(?:Who will win\?|Head to Head Statistics)/i)?.[1]||'',m=block.match(/Record\s+All\s+(\d+)W\s+(\d+)D\s+(\d+)L\s+(\d+)W\s+(\d+)D\s+(\d+)L/i);return m?{home:{win:+m[1],draw:+m[2],loss:+m[3]},away:{win:+m[4],draw:+m[5],loss:+m[6]}}:null}
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const r=await page.goto('https://www.goaloo.com/analysis/3061003',{waitUntil:'domcontentloaded',timeout:60000});if(!r||r.status()>=400)throw new Error(`HTTP ${r?.status()}`);await page.waitForTimeout(1200);const text=await page.locator('body').innerText();const out={market:parseMarket(text),strength:strength(text),h2h:h2h(text)};console.log(JSON.stringify(out,null,2));if(!out.market?.current?.oneX2||!out.strength||!out.h2h)throw new Error('analysis context parser incomplete');await browser.close();
