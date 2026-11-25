// TEST-only native formula drop-down. Changes ONLY the Adaptive Manual Control HTML module.
// Always patch the exact currently deployed Cloudflare module (not stale GitHub copies).
import assert from 'node:assert/strict';
function exactly(source,oldValue,newValue,label){
 const n=source.split(oldValue).length-1;
 assert.equal(n,1,label+'_EXPECTED_EXACTLY_ONE_ANCHOR_FOUND_'+n);
 return source.replace(oldValue,newValue);
}
export function patchAdaptiveFormulaSelect(moduleSource){
 const head='export const adaptiveControlHtml = ';
 assert(moduleSource.startsWith(head),'UNEXPECTED_MODULE_EXPORT');
 const html=JSON.parse(moduleSource.slice(head.length).trim().replace(/;$/,''));
 assert(html.includes('เปรียบเทียบทุกสูตร · Win / Loss'),'WRONG_PAGE');
 assert(html.includes('<input id="search" placeholder="ค้นหา A02, B03..."/>'),'EXPECTED_INPUT_NOT_PRESENT');
 assert(!html.includes('function syncFormulaDropdown()'),'ALREADY_PATCHED');
 let updated=html;
 updated=exactly(updated,
  '<div class="toolbar"><input id="search" placeholder="ค้นหา A02, B03..."/><select id="sort">',
  '<div class="toolbar"><select id="search" aria-label="เลือกสูตรเพื่อกรอง Win / Loss"><option value="">ทุกสูตร (42)</option></select><select id="sort">',
  'REPLACE_INPUT_WITH_FORMULA_DROPDOWN');
 updated=exactly(updated,
  '.toolbar input{max-width:180px}.toolbar select{max-width:220px}',
  '.toolbar #search{width:180px;max-width:100%}.toolbar select{max-width:220px}',
  'DROPDOWN_RESPONSIVE_WIDTH');
 const beforeLoad="async function load(){if(!token){showLogin();return}var j=await request('GET');data=j;draw()}";
 const afterLoad=String.raw