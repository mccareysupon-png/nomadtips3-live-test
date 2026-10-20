import {RIBBON_SCRIPT} from './ribbon-v23.mjs';
import {readFileSync} from 'node:fs';

export const OLD_SCRIPT_ID='b46-statistics-v23-single-row-14-20261020';
export const NEW_SCRIPT_ID='b46-statistics-v23-allthemes-repaired-20261020';
export const REPAIR_STYLE_ID='b46-statistics-v23-light-ribbon-repair-20261020';
const oldCheck="||document.documentElement.dataset.theme!=='dark'";
if(!RIBBON_SCRIPT.includes(oldCheck))throw Error('EXPECTED_ORIGINAL_RIBBON_THEME_CHECK_NOT_FOUND');
export const REPAIRED_RIBBON_SCRIPT=RIBBON_SCRIPT.replace(oldCheck,'');
export const V23_CSS=readFileSync('./single-row-v23.css','utf8');
if(!V23_CSS.includes('html[data-theme="dark"]'))throw Error('NO_DARK_RIBBON_STYLE_FOUND');
const swapColor=new Map([
 ['#1B3228','#E8F4EC'],['#172B23','#DAECE0'],['#DCEDE2','#203B2B'],
 ['#9EBFAC','#4D6C59'],['#EDF9F1','#183C2D'],['#94B4A1','#607D69'],
 ['#FFAE65','#9A5B25'],['#5CDF9D','#167C51'],['#FF8B9F','#A23F50'],
 ['#83D5EC','#226B85'],['#B6A5F5','#64539D'],['#E8CC86','#86671F'],
 ['rgba(255,255,255,.036)','rgba(255,255,255,.8)'],
 ['rgba(0,0,0,.11)','rgba(24,67,39,.075)']
]);
let light=V23_CSS.replaceAll('html[data-theme="dark"]','html:not([data-theme="dark"])');
for(const [a,b] of swapColor)light=light.replaceAll(a,b);
export const LIGHT_STYLE='<style id="'+REPAIR_STYLE_ID+'">'+light+'</style>';
export const NEW_RIBBON='<script id="'+NEW_SCRIPT_ID+'">'+REPAIRED_RIBBON_SCRIPT+'</script>';
export function patchedHtml(old){
 if(typeof old!=='string'||!old.includes('</head>'))throw Error('BASE_HTML_MISSING');
 if(old.includes(REPAIR_STYLE_ID)||old.includes(NEW_SCRIPT_ID))throw Error('REPAIR_ALREADY_PRESENT');
 const oldOpen='<script id="'+OLD_SCRIPT_ID+'">';
 const i=old.indexOf(oldOpen);
 if(i<0||old.indexOf(oldOpen,i+oldOpen.length)>=0)throw Error('EXACTLY_ONE_OLD_RIBBON_EXPECTED');
 const end=old.indexOf('</script>',i+oldOpen.length);
 if(end<0)throw Error('OLD_RIBBON_CLOSE_NOT_FOUND');
 const replaced=old.slice(0,i)+NEW_RIBBON+old.slice(end+9);
 return replaced.replace('</head>',LIGHT_STYLE+'</head>');
}
