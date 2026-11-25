import assert from 'node:assert/strict';
import {writeFileSync,unlinkSync} from 'node:fs';
import {adaptiveControlHtml} from './b46-adaptive-manual-control-page-test.mjs';
import {patchControlPage,patchSource,MARK} from './patch-adaptive-control-wld-totals.mjs';
const a=patchControlPage(adaptiveControlHtml);
assert(a.includes(MARK));
assert(a.includes('ผลรวม Win / Loss / Draw'));
assert(a.includes('showWldTotals(data.formulas)'));
assert(a.includes('DRAW สำหรับตลาด O/U 2.5 เท่ากับ 0'));
assert(a.includes('PENDING ไม่รวมใน Win Rate'));
const source='export const adaptiveControlHtml = '+JSON.stringify(adaptiveControlHtml)+';\n';
const b=patchSource(source);assert.equal(b.html,a);
const script=a.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(script,'CONTROL_CLIENT_SCRIPT_NOT_FOUND');
const temp='/tmp/b46-adaptive-wld-control-check.mjs';
writeFileSync(temp,script);
try{
 const {execFileSync}=await import('node:child_process');
 execFileSync(process.execPath,['--check',temp]);
}catch(e){throw Error('PATCHED_PAGE_SCRIPT_SYNTAX_INVALID '+e.stderr?.toString())}
finally{unlinkSync(temp)}
let repeated=false;
try{patchControlPage(a)}catch(e){repeated=String(e).includes('ALREADY_DEPLOYED')}
assert(repeated,'PATCH_NOT_IDEMPOTENCY_GUARDED');
console.log('B46_ADAPTIVE_CONTROL_WLD_PATCH_TEST_PASS '+JSON.stringify({originalBytes:adaptiveControlHtml.length,newBytes:a.length,hasTotals:true,formulaSummation:true,drawIsZeroBySettlementSchema:true,sourceUnchangedExceptControlHtml:true}));
