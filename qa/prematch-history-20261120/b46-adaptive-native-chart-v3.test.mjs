import test from 'node:test';
import assert from 'node:assert/strict';
import {patchAdaptiveNativeChart,patchAdaptiveNativeChartWorker,ADAPTIVE_30_90_CHART_VERSION} from './b46-adaptive-native-chart-v3-test.mjs';
const source=[
"const PREMATCH_TEST_SHELL_VERSION='test';",
"// B46_ADAPTIVE_RESEARCH_NATIVE_OU_TEST_V1",
"// B46_ADAPTIVE_NATIVE_RESEARCH_LAYOUT_FIX_V2",
"  let b46AdaptiveData=null,b46AdaptiveAt=0,b46AdaptiveLoading=null;",
"function b46AdaptivePanel(content){",
"panel.className='b46pm-adaptive-research-isolated';",
"      panel.append(mk('p',",
"        'History screen: '+(data.screeningCounts?.formulasTriggered??0));",
"}"
].join('\n');
test('graph lives in existing isolated research panel and does not touch Total',()=>{
 const a=patchAdaptiveNativeChart(source);
 assert(a.includes(ADAPTIVE_30_90_CHART_VERSION));
 assert(a.includes('series30?.byFormula'));
 assert(a.includes('series90?.byFormula'));
 assert(a.includes("graph.id='b46-adaptive-research-equity'"));
 assert(a.includes("panel.append(graph)"));
 assert(a.includes("b46AdaptiveChartDays=30"));
 assert(!a.includes('seriesTotal'));
 assert.throws(()=>patchAdaptiveNativeChart(a),/ALREADY_INSTALLED/);
});
test('only embedded PreMatch native JS changes',()=>{
 const main='var prematchClientScript = '+JSON.stringify(source)+';\n'+
  'const downstream="/__b46_pm_adaptive_research";';
 const next=patchAdaptiveNativeChartWorker(main);
 assert(next.worker.includes(ADAPTIVE_30_90_CHART_VERSION));
 assert(next.worker.endsWith('const downstream="/__b46_pm_adaptive_research";'));
});
