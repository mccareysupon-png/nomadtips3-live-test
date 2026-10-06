import { inspect, publicFile, sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
const b=await publicFile('/index.html','html');
const html=b.toString('utf8');
const sid='b46-daily-performance-runtime';
const open='<script id="'+sid+'">';
const s=html.indexOf(open), bs=html.indexOf('>',s)+1, e=html.indexOf('</script>',bs);
if(s<0||e<0) throw Error('PERFORMANCE_RUNTIME_MISSING');
const js=html.slice(bs,e);
function snip(name){
  const m=js.match(new RegExp('function\\s+'+name+'\\s*\\([^)]*\\)\\s*\\{[\\s\\S]{0,12000}?\\n\\}'));
  return m?m[0]:null;
}
const refs=(term)=>[...js.matchAll(new RegExp(term,'g'))].length;
console.log(JSON.stringify({
  activeVersion:current.restore.version,
  indexSha:sha(b),
  hasFastWindow:js.includes('PERFORMANCE_WINDOW_NOT_COVERED'),
  hasOldLedgerGuard:js.includes('STATISTICS_LEDGER_INCOMPLETE'),
  hasMarketFunction:/function\s+market\s*\(/.test(js),
  marketRefs:refs('market\\('),
  marketMapRefs:refs('markets'),
  marketLabels:{AH:refs('AH'),OU:refs("O/U"),oneXTwo:refs('1X2')},
  hasFlatScanner:html.includes('b46-flat-result-cards-runtime'),
  aggregate:snip('aggregate'),
  render:snip('render'),
  market:snip('market'),
  refresh:snip('refresh')
},null,2));