import {writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {publicFile,inspect,sha} from '../daily-performance-20261005/production.mjs';
mkdirSync('audit',{recursive:true});
const cur=await inspect();
const buf=await publicFile('/assets/affiliate/betsson-logo.png','image');
writeFileSync('audit/current.png',buf);
const py=[
'import sys,json',
'from PIL import Image',
'im=Image.open(sys.argv[1]).convert("RGBA")',
'b=im.getbbox()',
'print(json.dumps({"size":im.size,"bbox":b}))'
].join(';');
const raw=execFileSync('python3',['-c',py,'audit/current.png'],{encoding:'utf8'}).trim();
const meta=JSON.parse(raw);
const out={version:cur.restore.version,sha:sha(buf),...meta};
writeFileSync('audit/preflight.json',JSON.stringify(out,null,2));
console.log('BALL46_BETSSON_BOTTOM_PREFLIGHT',JSON.stringify(out));
