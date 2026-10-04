import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { inspect, publicFile, sha, literals, activeVersion } from './production.mjs';

const BRANCH='work/eventflow-dark-expanded-border-20261004';
assert.equal(process.env.GITHUB_REF_NAME,BRANCH,'UNCONFIRMED_BRANCH_STOP');
const current=await inspect();
const base=current.restore.version;
const css=await publicFile('/dashboard-v2-tune.css','css');
const event=await publicFile('/expanded-match-343.js','javascript');
const cssText=css.toString('utf8'), eventText=event.toString('utf8');
const lit=literals(current.source).get('__B46_EVENTFLOW_SIGNAL_JS_20261002__');
assert(lit,'EVENTFLOW_LITERAL_MISSING');
assert.equal(sha(Buffer.from(lit.value)),sha(event),'WORKER_EVENTFLOW_LITERAL_NOT_PUBLIC_SOURCE');
for(const x of ['B46_MATCH_CARD_ACTIVE_DARK_GLOW_20261004','.match-row.active']) assert(cssText.includes(x),`ACTIVE_CARD_BASE_MISSING:${x}`);
for(const x of ['B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004','B46_EVENTFLOW_EXPAND_MODE_20261004','B46_EVENTFLOW_LIVE_SCORE_HEADER_20261004','function openExpanded','expand-flow-card','expand-flow-chart']) assert(eventText.includes(x),`EVENTFLOW_BASE_MISSING:${x}`);
function snippet(text,needle,span=900){const i=text.indexOf(needle);return i<0?'NOT_FOUND':text.slice(Math.max(0,i-span),Math.min(text.length,i+needle.length+span));}
const report={baseVersion:base,cssSha:sha(css),eventSha:sha(event),activeCardCss:snippet(cssText,'B46_MATCH_CARD_ACTIVE_DARK_GLOW_20261004',700),openExpanded:snippet(eventText,'function openExpanded',1800),expandedEl:snippet(eventText,'expandedEl=',1800),flowCard:snippet(eventText,'expand-flow-card',1600),flowChart:snippet(eventText,'expand-flow-chart',1200)};
writeFileSync('audit/eventflow-dark-expanded-border-scout.json',JSON.stringify(report,null,2));
console.log(`BASE_VERSION=${base}`);
console.log('---ACTIVE_CARD_CSS---\n'+report.activeCardCss+'\n---END_ACTIVE_CARD_CSS---');
console.log('---OPEN_EXPANDED---\n'+report.openExpanded+'\n---END_OPEN_EXPANDED---');
console.log('---EXPANDED_EL---\n'+report.expandedEl+'\n---END_EXPANDED_EL---');
console.log('---FLOW_CARD---\n'+report.flowCard+'\n---END_FLOW_CARD---');
console.log('---FLOW_CHART---\n'+report.flowChart+'\n---END_FLOW_CHART---');
assert.equal(await activeVersion(),base,'PRODUCTION_CHANGED_DURING_SCOUT');
console.log('BALL46_EVENTFLOW_DARK_EXPANDED_BORDER_SCOUT_PASS');
