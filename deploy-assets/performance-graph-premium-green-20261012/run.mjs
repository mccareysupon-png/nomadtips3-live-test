import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';
import {inspect,activeVersion,getVersion,api,script,sha,canonical,publicFile} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const JS='longterm-performance-343.js',CSS='singlepage-workspace-343.css',INDEX='index.html';
const BASEMARK='/* B46_UNIT_STOCK_CHART_V3_20261012 */';
const JSMARK='/* B46_UNIT_CHART_SELECTOR_V5_20261012 */';
const CSSMARK='/* B46_GRAPH_PREMIUM_GREEN_STYLE_V6_20261012 */';
const CACHE='graph-premium-green-v6-20261012';
const BASE_JS_SHA='d2e0c83ac7de8e892d268a8cd90778ce5ec7707f35f23f60ba55ebffa0f8c51f';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('audit',{recursive:true});
const report={run:process.env.GITHUB_RUN_ID,scope:'Statistics chart renderer only. UNITS gets LINE/CANDLES selector sharing the same pan/zoom viewport. CANDLES uses visible Open/Close Y autoscale. ROI/WIN RATE unchanged. No Engine/API/Data/Settlement changes.'};
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function readRetry(label,fn,tries=5){let last;for(let i=0;i<tries;i++){try{return await fn()}catch(e){last=e;const m=String(e?.message||e);if(!/Unexpected token '<'|not valid JSON|fetch|ECONN|ETIMEDOUT|5\d\d/i.test(m))throw e;console.warn('READ_RETRY '+label+' '+(i+1)+'/'+tries+' '+m);await delay(1200*(i+1))}}throw last}
function exampleCheck(){const profits=[.17,-.80,1.80,2.80],expected=[[0,.17],[.17,-.63],[-.63,1.17],[1.17,3.97]];let net=0;const actual=profits.map(p=>{const open=net;net=Number((net+p).toFixed(10));return[Number(open.toFixed(2)),Number(net.toFixed(2))]});assert.deepEqual(actual,expected,'UNIT_EXAMPLE_MISMATCH');report.example={profits,actual,final:net}}
exampleCheck();

const TARGET_JS_SHA='d7fe6eac52d84a2b9a90bba518f0ef4f019024338f1276248c43b9a25763c8b4';
const dec=s=>Buffer.from(s,'base64').toString('utf8');
function patchJs(src){
 let out=src;
 const metricOld=dec('bGV0IG1ldHJpYz0ndW5pdHMnOwpsZXQgY3VycmVudFBvaW50cz1bXTs='),metricNew=dec('bGV0IG1ldHJpYz0ndW5pdHMnOwpsZXQgdW5pdENoYXJ0VHlwZT0nY2FuZGxlcyc7LyogQjQ2X1VOSVRfQ0hBUlRfU0VMRUNUT1JfVjVfMjAyNjEwMTIgKi8KbGV0IGN1cnJlbnRQb2ludHM9W107');assert(out.includes(metricOld),'METRIC_ANCHOR_MISSING');out=out.replace(metricOld,metricNew);
 const candleOld=dec('ZnVuY3Rpb24gdW5pdENhbmRsZXNTdmcocG9pbnRzLGdlbyl7CiBjb25zdCBuPXBvaW50cy5sZW5ndGgsc3RlcD1uPjE/Z2VvLnB3LyhuLTEpOmdlby5wdyxidz1NYXRoLm1heCgxLjE1LE1hdGgubWluKDguNSxzdGVwKi42MikpOwogbGV0IHBvc0Q9JycsbmVnRD0nJyxuZXV0cmFsRD0nJyxwb3M9MCxuZWc9MCxuZXV0cmFsPTA7CiBjb25zdCBzY2FsZT15U2NhbGUocG9pbnRzKSxzcGFuPU1hdGgubWF4KC4wMDAxLHNjYWxlLm1heC1zY2FsZS5taW4pLHk9dj0+Z2VvLlQrKHNjYWxlLm1heC12KS9zcGFuKmdlby5waDs='),candleNew=dec('ZnVuY3Rpb24gdW5pdFNjYWxlKHBvaW50cyl7LyogQjQ2X1VOSVRfVklTSUJMRV9PSExDX1NDQUxFX1Y1XzIwMjYxMDEyICovCiBjb25zdCB2YWxzPVtdO2Zvcihjb25zdCBwIG9mIHBvaW50cyl7Y29uc3QgY2xvc2U9TnVtYmVyKHAudmFsdWUpLHByb2ZpdD1OdW1iZXIuaXNGaW5pdGUocC5wcm9maXQpP3AucHJvZml0OjAsb3Blbj1jbG9zZS1wcm9maXQ7aWYoTnVtYmVyLmlzRmluaXRlKG9wZW4pKXZhbHMucHVzaChvcGVuKTtpZihOdW1iZXIuaXNGaW5pdGUoY2xvc2UpKXZhbHMucHVzaChjbG9zZSl9CiBpZighdmFscy5sZW5ndGgpcmV0dXJue21pbjotMSxtYXg6MX07bGV0IG1pbj1NYXRoLm1pbiguLi52YWxzKSxtYXg9TWF0aC5tYXgoLi4udmFscyk7aWYobWluPT09bWF4KXttaW4tPTE7bWF4Kz0xfWNvbnN0IHJhdz1tYXgtbWluLHBhZD1NYXRoLm1heCguMzUscmF3Ki4xNCk7cmV0dXJue21pbjptaW4tcGFkLG1heDptYXgrcGFkfQp9CmZ1bmN0aW9uIHVuaXRDYW5kbGVzU3ZnKHBvaW50cyxnZW8sc2NhbGUpewogY29uc3Qgbj1wb2ludHMubGVuZ3RoLHN0ZXA9bj4xP2dlby5wdy8obi0xKTpnZW8ucHcsYnc9TWF0aC5tYXgoMS4xNSxNYXRoLm1pbig4LjUsc3RlcCouNjIpKTsKIGxldCBwb3NEPScnLG5lZ0Q9JycsbmV1dHJhbEQ9JycscG9zPTAsbmVnPTAsbmV1dHJhbD0wOwogY29uc3Qgc3Bhbj1NYXRoLm1heCguMDAwMSxzY2FsZS5tYXgtc2NhbGUubWluKSx5PXY9Pmdlby5UKyhzY2FsZS5tYXgtdikvc3BhbipnZW8ucGg7');assert(out.includes(candleOld),'CANDLE_ANCHOR_MISSING');out=out.replace(candleOld,candleNew);
 const chartStart=out.indexOf('function chartHtml(s){/* B46_PERFORMANCE_MARKET_CHART_V3_20261012 */'),tail=out.indexOf('}currentPoints=all;currentPointOffset=0;currentPointTotal=all.length;',chartStart);assert(chartStart>=0&&tail>chartStart,'CHART_BOUNDARY_MISSING');out=out.slice(0,chartStart)+dec('ZnVuY3Rpb24gY2hhcnRIdG1sKHMpey8qIEI0Nl9QRVJGT1JNQU5DRV9NQVJLRVRfQ0hBUlRfVjVfMjAyNjEwMTIgKi9jb25zdCBhbGw9Z2V0UG9pbnRzKHMpO2lmKCFhbGwubGVuZ3RoKXtjdXJyZW50UG9pbnRzPVtdO2N1cnJlbnRQb2ludE9mZnNldD0wO2N1cnJlbnRQb2ludFRvdGFsPTA7cmV0dXJuJzxkaXYgY2xhc3M9ImI0Ni1wZXJmLWVtcHR5Ij5ObyBwcmljZWQgc2V0dGxlZCBzaWduYWxzIGluIHRoaXMgcmFuZ2UuPC9kaXY+J31pZihtZXRyaWM9PT0ndW5pdHMnKXtjb25zdCB2PXVuaXRWaWV3Rm9yKGFsbCkscG9pbnRzPWFsbC5zbGljZSh2LnN0YXJ0LHYuc3RhcnQrdi5jb3VudCk7Y3VycmVudFBvaW50cz1wb2ludHM7Y3VycmVudFBvaW50T2Zmc2V0PXYuc3RhcnQ7Y3VycmVudFBvaW50VG90YWw9YWxsLmxlbmd0aDtjb25zdCBzY2FsZT11bml0U2NhbGUocG9pbnRzKSxnZW89cGF0aERhdGEocG9pbnRzLHNjYWxlLm1pbixzY2FsZS5tYXgpLGF4ZXM9YXhpc1N2Zyhwb2ludHMsc2NhbGUubWluLHNjYWxlLm1heCxnZW8pLHplcm89c2NhbGUubWluPD0wJiZzY2FsZS5tYXg+PTA/JzxsaW5lIGNsYXNzPSJiNDYtcGVyZi16ZXJvLWxpbmUiIHgxPSInK2dlby5MKyciIHkxPSInK2dlby5iYXNlWSsnIiB4Mj0iJysoZ2VvLlctZ2VvLlIpKyciIHkyPSInK2dlby5iYXNlWSsnIj48L2xpbmU+JzonJyxwbG90PXVuaXRDaGFydFR5cGU9PT0nbGluZSc/JzxwYXRoIGNsYXNzPSJiNDYtcGVyZi11bml0LWxpbmUiIGQ9IicrZ2VvLmxpbmUrJyI+PC9wYXRoPic6dW5pdENhbmRsZXNTdmcocG9pbnRzLGdlbyxzY2FsZSk7cmV0dXJuICc8c3ZnIGNsYXNzPSJiNDYtcGVyZi1zdmcgYjQ2LXBlcmYtdW5pdC1zdG9jayIgZGF0YS1iNDYtdW5pdC1zdG9jaz0iMSIgZGF0YS1iNDYtdW5pdC1jaGFydC10eXBlPSInK3VuaXRDaGFydFR5cGUrJyIgZGF0YS1iNDYtdW5pdC1zY2FsZT0idmlzaWJsZS1vcGVuLWNsb3NlIiBkYXRhLWI0Ni11bml0LXRvdGFsPSInK2FsbC5sZW5ndGgrJyIgZGF0YS1iNDYtdW5pdC1zdGFydD0iJyt2LnN0YXJ0KyciIGRhdGEtYjQ2LXVuaXQtY291bnQ9Iicrdi5jb3VudCsnIiBkYXRhLWI0Ni11bml0LXltaW49Iicrc2NhbGUubWluKyciIGRhdGEtYjQ2LXVuaXQteW1heD0iJytzY2FsZS5tYXgrJyIgdmlld0JveD0iMCAwIDEwMDAgMjUwIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJub25lIiBhcmlhLWxhYmVsPSJOZXQgVW5pdHMgJyt1bml0Q2hhcnRUeXBlKycgY2hhcnQiPicrYXhlcyt6ZXJvK3Bsb3QrJzxsaW5lIGRhdGEtYjQ2LWhvdmVyLWxpbmUgY2xhc3M9ImI0Ni1wZXJmLWhvdmVyLWxpbmUiIHgxPSIwIiB5MT0iJytnZW8uVCsnIiB4Mj0iMCIgeTI9IicrKGdlby5UK2dlby5waCkrJyIgaGlkZGVuPjwvbGluZT48bGluZSBkYXRhLWI0Ni1ob3Zlci1obGluZSBjbGFzcz0iYjQ2LXBlcmYtaG92ZXItbGluZSBiNDYtcGVyZi1ob3Zlci1obGluZSIgeDE9IicrZ2VvLkwrJyIgeTE9IjAiIHgyPSInKyhnZW8uVy1nZW8uUikrJyIgeTI9IjAiIGhpZGRlbj48L2xpbmU+PGNpcmNsZSBkYXRhLWI0Ni1ob3Zlci1kb3QgY2xhc3M9ImI0Ni1wZXJmLWhvdmVyLWRvdCIgY3g9IjAiIGN5PSIwIiByPSIzIiBoaWRkZW4+PC9jaXJjbGU+PC9zdmc+PGRpdiBjbGFzcz0iYjQ2LXBlcmYtdGlwIiBkYXRhLWI0Ni1wZXJmLXRpcCBoaWRkZW4+PC9kaXY+PGRpdiBjbGFzcz0iYjQ2LXBlcmYteWJhZGdlIiBkYXRhLWI0Ni1wZXJmLXliYWRnZSBoaWRkZW4+PC9kaXY+PGRpdiBjbGFzcz0iYjQ2LXBlcmYteGJhZGdlIiBkYXRhLWI0Ni1wZXJmLXhiYWRnZSBoaWRkZW4+PC9kaXY+Jyt1bml0TmF2SHRtbChhbGwubGVuZ3RoLHYuc3RhcnQsdi5jb3VudCk=')+out.slice(tail);
 const modeEnd=dec('PGJ1dHRvbiBkYXRhLWI0Ni1tb2RlPSJyYXRlIiBjbGFzcz0iJHttZXRyaWM9PT0ncmF0ZSc/J2FjdGl2ZSc6Jyd9Ij5XSU4gUkFURTwvYnV0dG9uPjwvZGl2Pg=='),typeUi=dec('JHttZXRyaWM9PT0ndW5pdHMnPyc8ZGl2IGNsYXNzPSJiNDYtcGVyZi1tb2RlIGI3Ni1wZXJmLWNoYXJ0LXR5cGUiIHJvbGU9Imdyb3VwIiBhcmlhLWxhYmVsPSJDaGFydCB0eXBlIj48YnV0dG9uIGRhdGEtYjQ2LWNoYXJ0LXR5cGU9ImxpbmUiIGNsYXNzPSInKyh1bml0Q2hhcnRUeXBlPT09J2xpbmUnPydhY3RpdmUnOicnKSsnIj5MSU5FPC9idXR0b24+PGJ1dHRvbiBkYXRhLWI0Ni1jaGFydC10eXBlPSJjYW5kbGVzIiBjbGFzcz0iJysodW5pdENoYXJ0VHlwZT09PSdjYW5kbGVzJz8nYWN0aXZlJzonJykrJyI+Q0FORExFUzwvYnV0dG9uPjwvZGl2Pic6Jyd9');assert(out.includes(modeEnd),'MODE_ANCHOR_MISSING');out=out.replace(modeEnd,modeEnd+typeUi);
 const bindOld=dec('ZnVuY3Rpb24gYmluZENhcmQoKXtkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1iNDYtcmFuZ2VdJykuZm9yRWFjaChiPT5iLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywoKT0+e3JhbmdlPWIuZGF0YXNldC5iNDZSYW5nZXx8J2FsbCc7YjQ2VW5pdFZpZXc9e3N0YXJ0Om51bGwsY291bnQ6bnVsbCx0b3RhbDowfTtyZW5kZXIoKX0pKTtkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1iNDYtbW9kZV0nKS5mb3JFYWNoKGI9PmIuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCgpPT57bWV0cmljPWIuZGF0YXNldC5iNDZNb2RlfHwndW5pdHMnO3JlbmRlcigpfSkpfQ=='),bindNew=dec('ZnVuY3Rpb24gYmluZENhcmQoKXtkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1iNDYtcmFuZ2VdJykuZm9yRWFjaChiPT5iLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywoKT0+e3JhbmdlPWIuZGF0YXNldC5iNDZSYW5nZXx8J2FsbCc7YjQ2VW5pdFZpZXc9e3N0YXJ0Om51bGwsY291bnQ6bnVsbCx0b3RhbDowfTtyZW5kZXIoKX0pKTtkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1iNDYtbW9kZV0nKS5mb3JFYWNoKGI9PmIuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCgpPT57bWV0cmljPWIuZGF0YXNldC5iNDZNb2RlfHwndW5pdHMnO3JlbmRlcigpfSkpO2RvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWI0Ni1jaGFydC10eXBlXScpLmZvckVhY2goYj0+Yi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsKCk9Pnt1bml0Q2hhcnRUeXBlPWIuZGF0YXNldC5iNDZDaGFydFR5cGU9PT0nbGluZSc/J2xpbmUnOidjYW5kbGVzJztyZW5kZXIoKX0pKX0=');assert(out.includes(bindOld),'BIND_ANCHOR_MISSING');out=out.replace(bindOld,bindNew);
 const hoverOld=dec('Y29uc3Qgc2NhbGU9eVNjYWxlKGN1cnJlbnRQb2ludHMpLGdlbz1wYXRoRGF0YShjdXJyZW50UG9pbnRzLHNjYWxlLm1pbixzY2FsZS5tYXgpLHJhd1g9'),hoverNew=dec('Y29uc3Qgc2NhbGU9bWV0cmljPT09J3VuaXRzJz91bml0U2NhbGUoY3VycmVudFBvaW50cyk6eVNjYWxlKGN1cnJlbnRQb2ludHMpLGdlbz1wYXRoRGF0YShjdXJyZW50UG9pbnRzLHNjYWxlLm1pbixzY2FsZS5tYXgpLHJhd1g9');assert(out.includes(hoverOld),'HOVER_ANCHOR_MISSING');out=out.replace(hoverOld,hoverNew);
 assert(out.includes(JSMARK),'TARGET_MARKER_MISSING');new Function(out);assert.equal(sha(Buffer.from(out)),TARGET_JS_SHA,'TARGET_JS_SHA_MISMATCH');return Buffer.from(out);
}
const cssAdd=`
/* B46_GRAPH_PREMIUM_GREEN_STYLE_V6_20261012 */
body[data-workspace-view="statistics"] .b46-perf-unit-line{
  fill:none!important;
  stroke:#43f58b!important;
  stroke-width:2.35!important;
  stroke-linecap:round!important;
  stroke-linejoin:round!important;
  vector-effect:non-scaling-stroke!important;
  filter:drop-shadow(0 0 2px rgba(67,245,139,.98)) drop-shadow(0 0 7px rgba(67,245,139,.52))!important;
  opacity:1!important
}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-pos{
  stroke:#3ee58d!important;
  filter:drop-shadow(0 0 3px rgba(62,229,141,.22))
}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-neg{
  stroke:#ff5f70!important;
  filter:drop-shadow(0 0 3px rgba(255,95,112,.20))
}
body[data-workspace-view="statistics"] .b46-perf-unit-candle-neutral{stroke:#9fb2c1!important;opacity:.78!important}
body[data-workspace-view="statistics"] .b46-perf-axis-text,
body[data-workspace-view="statistics"] .b46-perf-axis-title,
body[data-workspace-view="statistics"] .b46-perf-unit-axis,
body[data-workspace-view="statistics"] .b46-perf-unit-nav-meta,
body[data-workspace-view="statistics"] .b46-perf-ybadge,
body[data-workspace-view="statistics"] .b46-perf-xbadge,
body[data-workspace-view="statistics"] .b46-perf-tip{
  font-family:"IBM Plex Sans","IBM Plex Sans Thai",Inter,Arial,sans-serif!important;
  font-variant-numeric:tabular-nums!important
}
body[data-workspace-view="statistics"] .b46-perf-axis-text{
  font-size:9px!important;
  font-weight:650!important;
  letter-spacing:.015em!important
}
body[data-workspace-view="statistics"] .b46-perf-axis-title{
  font-size:8.5px!important;
  font-weight:700!important;
  letter-spacing:.045em!important;
  text-transform:uppercase
}
body[data-workspace-view="statistics"] .b46-perf-grid,
body[data-workspace-view="statistics"] .b46-perf-vgrid{
  stroke-width:.7!important;
  vector-effect:non-scaling-stroke!important
}
body[data-workspace-view="statistics"] .b46-perf-zero-line{
  stroke-width:1!important;
  stroke-dasharray:4 4!important;
  vector-effect:non-scaling-stroke!important
}
body[data-workspace-view="statistics"] .b46-perf-hover-line{
  stroke-width:.8!important;
  stroke-dasharray:3 4!important;
  vector-effect:non-scaling-stroke!important
}
body[data-workspace-view="statistics"] .b46-perf-hover-dot{
  stroke-width:1.3!important;
  filter:drop-shadow(0 0 4px rgba(67,245,139,.38))
}
body[data-workspace-view="statistics"] .b46-perf-ybadge,
body[data-workspace-view="statistics"] .b46-perf-xbadge{
  font-size:9px!important;
  font-weight:800!important;
  letter-spacing:.025em!important;
  border-radius:5px!important;
  backdrop-filter:blur(6px)
}
body[data-workspace-view="statistics"] .b46-perf-tip{
  font-size:10px!important;
  line-height:1.42!important;
  border-radius:8px!important;
  backdrop-filter:blur(10px)
}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-track{
  background:rgba(95,124,143,.11)!important;
  border-color:rgba(108,145,165,.16)!important
}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-window{
  background:rgba(67,245,139,.22)!important;
  border-color:rgba(67,245,139,.58)!important;
  box-shadow:0 0 10px rgba(67,245,139,.18),inset 0 0 8px rgba(67,245,139,.08)!important
}
body[data-workspace-view="statistics"] .b46-perf-unit-nav-meta{
  color:#7f98aa!important;
  opacity:.88!important
}
body[data-workspace-view="statistics"] .b46-perf-chart-type button.active{
  color:#53f69a!important;
  border-color:rgba(67,245,139,.48)!important;
  box-shadow:inset 0 0 0 1px rgba(67,245,139,.08),0 0 10px rgba(67,245,139,.10)!important
}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-grid,
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-vgrid{stroke:rgba(122,153,173,.11)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-zero-line{stroke:rgba(197,218,231,.32)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-hover-line{stroke:rgba(107,242,188,.50)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-axis-text{fill:#a8bece!important;color:#a8bece!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-axis-title{fill:#d5e3ec!important;color:#d5e3ec!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-ybadge,
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-xbadge{
  color:#dff7ea!important;
  background:rgba(8,20,27,.90)!important;
  border:1px solid rgba(67,245,139,.22)!important
}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-ybadge.positive{color:#53f69a!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-ybadge.negative{color:#ff7482!important;border-color:rgba(255,95,112,.24)!important}
html[data-theme="dark"] body[data-workspace-view="statistics"] .b46-perf-tip{
  color:#dbe8f0!important;
  background:rgba(7,17,24,.94)!important;
  border:1px solid rgba(126,158,179,.16)!important;
  box-shadow:0 12px 30px rgba(0,0,0,.28)!important
}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-line{
  stroke:#12a85b!important;
  filter:drop-shadow(0 0 2px rgba(18,168,91,.45)) drop-shadow(0 0 5px rgba(18,168,91,.20))!important
}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-candle-pos{stroke:#159f5a!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-unit-candle-neg{stroke:#d94c5b!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-grid,
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-vgrid{stroke:rgba(52,78,96,.10)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-zero-line{stroke:rgba(42,61,75,.30)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-hover-line{stroke:rgba(18,168,91,.42)!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-axis-text{fill:#536c7c!important;color:#536c7c!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-axis-title{fill:#263d4c!important;color:#263d4c!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-ybadge,
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-xbadge{
  color:#24513a!important;
  background:rgba(247,251,249,.94)!important;
  border:1px solid rgba(18,168,91,.18)!important
}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-ybadge.positive{color:#0c934e!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-ybadge.negative{color:#c73f50!important}
html[data-theme="light"] body[data-workspace-view="statistics"] .b46-perf-tip{
  color:#2c4555!important;
  background:rgba(255,255,255,.96)!important;
  border:1px solid rgba(51,78,95,.12)!important;
  box-shadow:0 10px 26px rgba(43,64,78,.14)!important
}
`;
function patchIndex(src){let out=src;out=out.replace(/longterm-performance-343\.js\?v=[^"'<>\s]+/g,'longterm-performance-343.js?v='+CACHE);out=out.replace(/singlepage-workspace-343\.css\?v=[^"'<>\s]+/g,'singlepage-workspace-343.css?v='+CACHE);assert(out.includes('longterm-performance-343.js?v='+CACHE),'LONGTERM_CACHE_BUST_MISSING');return out}
async function runtimeCheck(){
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);assert(exe,'NO_CHROME');
 const browser=await puppeteer.launch({headless:true,executablePath:exe,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1050});await page.setCacheEnabled(false);
  await page.goto('https://ball46.com/?view=statistics&unitSelectorV5Verify='+Date.now(),{waitUntil:'networkidle2',timeout:90000});await delay(4500);
  const before=await page.evaluate(()=>{const q=s=>document.querySelector(s),g=q('.b46-perf-unit-stock'),c=q('.b46-perf-unit-candles');return{stock:Boolean(g),type:g?.dataset.b46UnitChartType,scale:g?.dataset.b46UnitScale,total:Number(g?.dataset.b46UnitTotal||0),start:Number(g?.dataset.b46UnitStart||0),count:Number(g?.dataset.b46UnitCount||0),ymin:Number(g?.dataset.b46UnitYmin),ymax:Number(g?.dataset.b46UnitYmax),candleCount:Number(c?.dataset.b46CandleCount||0),line:Boolean(q('.b46-perf-unit-line')),nav:Boolean(q('[data-b46-unit-nav]')),types:[...document.querySelectorAll('[data-b46-chart-type]')].map(x=>x.textContent.trim()),ranges:[...document.querySelectorAll('[data-b46-range]')].map(x=>x.textContent.trim())}});
  assert(before.stock&&before.nav,'UNIT_STOCK_UI_MISSING');assert.equal(before.type,'candles','DEFAULT_TYPE_NOT_CANDLES');assert.equal(before.scale,'visible-open-close','VISIBLE_SCALE_MODE_MISSING');assert(before.ymax>before.ymin,'VISIBLE_SCALE_INVALID');assert(before.candleCount===before.count&&before.count>=20,'CANDLE_VIEWPORT_INVALID');assert.deepEqual(before.types,['LINE','CANDLES'],'CHART_TYPE_MENU_MISSING');assert.deepEqual(before.ranges,['7D','30D','90D','ALL'],'RANGES_CHANGED');
  const box=await page.$eval('.b46-perf-unit-stock',e=>{const r=e.getBoundingClientRect();return{x:r.left+r.width*.55,y:r.top+r.height*.5}});await page.mouse.move(box.x,box.y);await page.mouse.wheel({deltaY:-480});await delay(300);
  const zoomed=await page.$eval('.b46-perf-unit-stock',e=>({start:Number(e.dataset.b46UnitStart),count:Number(e.dataset.b46UnitCount)}));assert(zoomed.count<before.count,'WHEEL_ZOOM_DID_NOT_ZOOM_IN');
  await page.click('[data-b46-chart-type="line"]');await delay(250);
  const lineMode=await page.evaluate(()=>{const g=document.querySelector('.b46-perf-unit-stock');return{type:g?.dataset.b46UnitChartType,start:Number(g?.dataset.b46UnitStart),count:Number(g?.dataset.b46UnitCount),line:Boolean(document.querySelector('.b46-perf-unit-line')),candles:Boolean(document.querySelector('.b46-perf-unit-candles'))}});
  assert.equal(lineMode.type,'line','LINE_TYPE_NOT_SELECTED');assert(lineMode.line&&!lineMode.candles,'LINE_RENDERER_WRONG');assert.equal(lineMode.start,zoomed.start,'VIEWPORT_MOVED_ON_TYPE_SWITCH');assert.equal(lineMode.count,zoomed.count,'ZOOM_CHANGED_ON_TYPE_SWITCH');
  await page.click('[data-b46-chart-type="candles"]');await delay(250);const candlesBack=await page.evaluate(()=>{const g=document.querySelector('.b46-perf-unit-stock');return{type:g?.dataset.b46UnitChartType,candles:Boolean(document.querySelector('.b46-perf-unit-candles'))}});assert.equal(candlesBack.type,'candles');assert(candlesBack.candles,'CANDLES_NOT_RESTORED');
  await page.click('[data-b46-mode="roi"]');await delay(250);const roi=await page.evaluate(()=>({selector:document.querySelectorAll('[data-b46-chart-type]').length,line:Boolean(document.querySelector('.b46-perf-line')),area:Boolean(document.querySelector('.b46-perf-area'))}));assert.equal(roi.selector,0,'TYPE_SELECTOR_MUST_HIDE_OUTSIDE_UNITS');assert(roi.line&&roi.area,'ROI_RENDERER_CHANGED');
  report.runtime={before,zoomed,lineMode,candlesBack,roi};save();
 }finally{await browser.close()}
}
let current=null,candidate=null;
async function rollback(){if(!current)return;const a=await readRetry('rollback-active',()=>activeVersion());if(a===current.restore.version)return;if(candidate&&a!==candidate)return;await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:current.restore.version,percentage:100}]})});assert.equal(await readRetry('rollback-confirm',()=>activeVersion()),current.restore.version,'ROLLBACK_NOT_CONFIRMED')}
try{
 current=await readRetry('inspect',()=>inspect());const base=current.restore.version;report.baseVersion=base;
 const workerSha=sha(Buffer.from(current.source)),settingsBefore=await readRetry('settings-before',()=>api('/scripts/'+script+'/settings')),settingsSha=sha(canonical(settingsBefore)),cronsBefore=await readRetry('schedules-before',()=>schedules());
 const jb=await publicFile('/'+JS),cb=await publicFile('/'+CSS),ib=await publicFile('/'+INDEX),js0=jb.toString('utf8'),css0=cb.toString('utf8'),idx0=ib.toString('utf8');
 assert.equal(sha(jb),BASE_JS_SHA,'CURRENT_V3_JS_HASH_CHANGED');assert(js0.includes(BASEMARK),'CURRENT_STOCK_V3_MISSING');assert(!js0.includes(JSMARK),'JS_ALREADY_PATCHED');assert(css0.includes('B46_UNIT_CHART_SELECTOR_STYLE_V5_20261012'),'CURRENT_SELECTOR_STYLE_V5_MISSING');assert(!css0.includes(CSSMARK),'CSS_ALREADY_PATCHED');
 const target=patchJs(js0);report.syntax='PASS';
 const c1=Buffer.from(css0+'\n'+cssAdd+'\n'),i1=Buffer.from(patchIndex(idx0));writeFileSync('audit/js-before.js',jb);writeFileSync('audit/js-after.js',target);writeFileSync('audit/css-before.css',cb);writeFileSync('audit/css-after.css',c1);writeFileSync('audit/index-before.html',ib);writeFileSync('audit/index-after.html',i1);
 const staged=await readRetry('stage-current-rail',()=>stageCurrentRail(current.version,settingsBefore,cronsBefore,current.source));await readRetry('verify-rail-base-1',()=>verifyRailBase(staged));assert.equal(staged.hashes[JS],sha(jb),'STAGED_JS_NOT_CURRENT');assert.equal(staged.hashes[CSS],sha(cb),'STAGED_CSS_NOT_CURRENT');assert.equal(staged.hashes[INDEX],sha(ib),'STAGED_INDEX_NOT_CURRENT');
 const protectedAssets={...staged.hashes};delete protectedAssets[JS];delete protectedAssets[CSS];delete protectedAssets[INDEX];writeFileSync(resolve(staged.runtime,'assets',JS),target);writeFileSync(resolve(staged.runtime,'assets',CSS),c1);writeFileSync(resolve(staged.runtime,'assets',INDEX),i1);
 wrangler(staged,true);assert.equal(await readRetry('active-after-dry-run',()=>activeVersion()),base,'PRODUCTION_MOVED_AFTER_DRY_RUN');await readRetry('verify-rail-base-2',()=>verifyRailBase(staged));
 try{
  wrangler(staged);for(let i=0;i<30;i++){const a=await readRetry('active-detect-candidate',()=>activeVersion());if(a!==base){candidate=a;break}await delay(1200)}assert(candidate,'NO_NEW_VERSION');
  let live=false;for(let i=0;i<40;i++){assert.equal(await readRetry('active-during-verify',()=>activeVersion()),candidate,'PRODUCTION_MOVED_DURING_VERIFY');try{const a=(await publicFile('/'+JS)).toString('utf8'),b=(await publicFile('/'+CSS)).toString('utf8'),d=(await publicFile('/'+INDEX)).toString('utf8');if(a.includes(JSMARK)&&b.includes(CSSMARK)&&d.includes(CACHE)){live=true;break}}catch{}await delay(1000)}assert(live,'PATCH_NOT_LIVE');
  for(const [p,h] of Object.entries(protectedAssets))assert.equal(sha(await publicFile('/'+p)),h,'UNRELATED_ASSET_CHANGED:'+p);await runtimeCheck();
  const cv=await readRetry('candidate-version',()=>getVersion(candidate)),cm=cv.modules.find(m=>m.name===cv.main_module);assert(cm,'FINAL_MAIN_MISSING');assert.equal(sha(Buffer.from(cm.content_base64,'base64')),workerSha,'WORKER_CHANGED');assert.equal(sha(canonical(await readRetry('settings-final',()=>api('/scripts/'+script+'/settings')))),settingsSha,'SETTINGS_CHANGED');assert.equal(canonical(await readRetry('schedules-final',()=>schedules())),canonical(cronsBefore),'CRONS_CHANGED');
  report.finalVersion=candidate;report.changed=[JS,CSS,INDEX];report.unchangedAssets=Object.keys(protectedAssets).length;report.result='SUCCESS';save();console.log('BALL46_GRAPH_PREMIUM_GREEN_STYLE_V6_SUCCESS '+JSON.stringify({base,candidate,changed:report.changed,unchangedAssets:report.unchangedAssets,runtime:report.runtime}));
 }catch(e){report.error=e.message;try{await rollback()}catch(rb){report.rollbackError=rb.message}save();throw e}
}catch(e){report.result='FAIL_STOPPED';report.error=e.message;save();console.error(e.stack);process.exitCode=1}
