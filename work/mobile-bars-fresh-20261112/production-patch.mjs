import assert from'node:assert/strict';
export function patchProductionHTML(html){const re=/expanded-match-343\.js\?v=b46-eventflow-dialog-20261105b(?:&(?:amp;)?b46_static=[a-f0-9]+)?/g;assert.equal([...html.matchAll(re)].length,1,'SCRIPT_REFERENCE_DRIFT');return html.replace(re,'expanded-match-343.js?v=b46-mobile-bars-fresh-20261112')}
