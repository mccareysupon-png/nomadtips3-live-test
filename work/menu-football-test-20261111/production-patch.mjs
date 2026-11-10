import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
export const previous=await readFile(new URL('./previous-icons.js',import.meta.url),'utf8'),addition=await readFile(new URL('./icons.js',import.meta.url),'utf8');
// The only presentation changes are ball data and per-instance SVG gradient identifiers.
function withoutBall(s){return s.replace(/^const ball=.*;$/m,'BALL').replace('let queued=false,ballSequence=0;','let queued=false;').replace(".replaceAll('b46ball-','b46ball-'+(++ballSequence)+'-')",'').trim()}
assert.equal(withoutBall(previous),withoutBall(addition),'NON_BALL_CONTROLLER_DRIFT');
export function patchProductionHTML(html){const anchor='<script id="b46-menu-icons-20261110-script">'+previous+'</script>';assert.equal(html.split(anchor).length,2,'CURRENT_ICON_CONTROLLER_DRIFT');const next=html.replace(anchor,()=>'<script id="b46-menu-icons-20261110-script">'+addition+'</script>');assert.equal(next.replace(addition,previous),html,'NON_BALL_HTML_CHANGED');return next}
