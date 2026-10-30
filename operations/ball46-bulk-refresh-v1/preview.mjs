import {ALLOWED_SECONDS,DEFAULT_SECONDS,restoreDefault,decideBulkRefresh} from './core.mjs';
const choice=document.querySelector('#refresh'),out=document.querySelector('#effective'),reason=document.querySelector('#reason'),message=document.querySelector('#message');
for(const n of ALLOWED_SECONDS){const option=document.createElement('option');option.value=String(n);option.textContent=String(n)+' วินาที'+(n===DEFAULT_SECONDS?' — DEFAULT':'');choice.append(option);}
choice.value=String(DEFAULT_SECONDS);
function render(){const result=decideBulkRefresh({requestedSeconds:Number(choice.value)});out.textContent=String(result.effectiveSeconds)+' วินาที';reason.textContent=result.reason==='DEFAULT'?'ค่าเริ่มต้นที่ปลอดภัย':'ยังไม่มีข้อมูลโควตารวมที่ยืนยัน — ใช้ DEFAULT';}
choice.addEventListener('change',()=>{message.textContent='เลือกค่าทดลองเท่านั้น ยังไม่บันทึก Production';render();});
document.querySelector('#reset').addEventListener('click',()=>{choice.value=String(restoreDefault().requestedSeconds);message.textContent='คืนค่า DEFAULT ในตัวอย่างแล้ว';render();});
render();
