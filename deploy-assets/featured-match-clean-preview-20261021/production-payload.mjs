import {readFileSync} from 'node:fs';
import {FEATURED_PREVIEW_SCRIPT} from './clean-featured.mjs';

export const FEATURED_PROD_MARKER='b46-featured-clean-recessed-production-20261021';
const sampleStart=FEATURED_PREVIEW_SCRIPT.indexOf('function sampleFromScreenshot(){');
const sampleEnd=FEATURED_PREVIEW_SCRIPT.indexOf('function render(');
if(sampleStart<0||sampleEnd<sampleStart)throw Error('SAMPLE_FUNCTION_REFACTOR_ANCHOR_MISSING');
let script=FEATURED_PREVIEW_SCRIPT.slice(0,sampleStart)+FEATURED_PREVIEW_SCRIPT.slice(sampleEnd);
const old='const data=missing?sampleFromScreenshot():actual;';
if(!script.includes(old))throw Error('SCREENSHOT_FALLBACK_NOT_FOUND');
script=script.replace(old,
 "if(missing){\n"+
 "  // No real fixture available. Never show mock screenshot data to visitors.\n"+
 "  if(pc)pc.replaceChildren();\n"+
 "  if(mobile)mobile.replaceChildren();\n"+
 "  src.classList.remove('b46fm-source-hidden');\n"+
 "  last='';\n"+
 "  return;\n"+
 " }\n"+
 " const data=actual;");
if(script.includes('function sampleFromScreenshot')||script.includes('sampleFromScreenshot()'))throw Error('MOCK_DATA_STILL_REACHABLE');
export const FEATURED_PRODUCTION_SCRIPT=script;
export const FEATURED_PRODUCTION_CSS=readFileSync('./clean-featured.css','utf8')+'\n'+readFileSync('./recessed-facts-production.css','utf8');
if(!FEATURED_PRODUCTION_CSS.includes('inset 0 3px 7px -3px'))throw Error('RECESSED_CSS_NOT_INCLUDED');
