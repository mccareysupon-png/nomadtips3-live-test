// TEST-only patch, generated against the live deployed HTML module.
import assert from 'node:assert/strict';
function replaceExactly(source,search,replacement,label){
 const count=source.split(search).length-1;
 assert.equal(count,1,label+'_MUST_APPEAR_ONCE_GOT_'+count);
 return source.replace(search,replacement);
}
export function patchAdaptiveFormulaSelect(moduleSource){
 const head='export const adaptiveControlHtml = ';
 assert(moduleSource.startsWith(head),'UNEXPECTED_MODULE_EXPORT');
 const html=JSON.parse(moduleSource.slice(head.length).trim().replace(/;$/,''));
 assert(html.includes('เปรียบเทียบทุกสูตร · Win / Loss'),'WRONG_PAGE');
 assert(html.includes('<input id="search" placeholder="ค้นหา A02, B03..."/>'),'EXPECTED_INPUT_MISSING');
 assert(!html.includes('function syncFormulaDropdown()'),'ALREADY_PATCHED');
 let updated=html;
 updated=replaceExactly(updated,
  '<div class="toolbar"><input id="search" placeholder="ค้นหา A02, B03..."/><select id="sort">',
  '<div class="toolbar"><select id="search" aria-label="เลือกสูตรเพื่อกรอง Win / Loss"><option value="">ทุกสูตร (42)</option></select><select id="sort">',
  'REPLACE_SEARCH_INPUT');
 updated=replaceExactly(updated,
  '.toolbar input{max-width:180px}.toolbar select{max-width:220px}',
  '.toolbar #search{width:180px;max-width:100%}.toolbar select{max-width:220px}',
  'PRESERVE_RESPONSIVE_WIDTH');
 const oldLoad="async function load(){if(!token){showLogin();return}var j=await request('GET');data=j;draw()}";
 const newLoad=[
  'function syncFormulaDropdown(){',
  " var sel=by('search'),previous=sel.value;",
  " var ids=data.formulas.map(function(f){return f.formula}).sort(function(a,b){return a.localeCompare(b)});",
  ' sel.replaceChildren();',
  " var all=document.createElement('option');all.value='';all.textContent='ทุกสูตร ('+ids.length+')';sel.append(all);",
  ' ids.forEach(function(id){',
  "  var option=document.createElement('option');option.value=id;option.textContent=id;sel.append(option);",
  ' });',
  " sel.value=ids.indexOf(previous)!==-1?previous:'';",
  '}',
  "async function load(){if(!token){showLogin();return}var j=await request('GET');data=j;syncFormulaDropdown();draw()}"
 ].join('\n');
 updated=replaceExactly(updated,oldLoad,newLoad,'POPULATE_FROM_LIVE_42_FORMULA_API');
 updated=replaceExactly(updated,
  "var q=by('search').value.trim().toUpperCase(),filter=by('statusFilter').value,sort=by('sort').value;",
  "var q=by('search').value,filter=by('statusFilter').value,sort=by('sort').value;",
  'READ_NATIVE_SELECT');
 updated=replaceExactly(updated,
  "return f.formula.includes(q)&&(filter==='all'||filter==='PAUSED'&&f.mode!=='RUN'||filter===f.mode)",
  "return (!q||f.formula===q)&&(filter==='all'||filter==='PAUSED'&&f.mode!=='RUN'||filter===f.mode)",
  'FILTER_EXACT_FORMULA');
 updated=replaceExactly(updated,
  "by('search').addEventListener('input',draw);by('sort').addEventListener('change',draw);by('statusFilter').addEventListener('change',draw);",
  "by('search').addEventListener('change',function(){if(this.value)selected=this.value;draw()});by('sort').addEventListener('change',draw);by('statusFilter').addEventListener('change',draw);",
  'DROPDOWN_UPDATE_SELECTED_CHART');
 assert(updated.includes('function syncFormulaDropdown()'));
 assert(updated.includes("if(this.value)selected=this.value;draw()"));
 assert(!updated.includes('<input id="search"'));
 return head+JSON.stringify(updated)+';\n';
}
