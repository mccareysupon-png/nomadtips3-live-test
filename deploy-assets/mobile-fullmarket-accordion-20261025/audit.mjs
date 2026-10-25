// Read-only production UI inventory. Never requests a fixture or mutates Cloudflare.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://ball46.com';
const paths=['/','/full-odds-main-343.js','/full-odds-main-343.css','/expanded-match-343.js','/expanded-match-343.css','/bulk-odds-compat-343.js','/dashboard-v2-stage3.js'];
const dir=new URL('./audit/public/',import.meta.url);
await mkdir(dir,{recursive:true});
const report=[];
for (const path of paths) {
  try{
    const response=await fetch(base+path,{headers:{'cache-control':'no-cache','user-agent':'BALL46-Mobile-Market-UI-ReadOnly-Audit'},signal:AbortSignal.timeout(30000)});
    const bytes=Buffer.from(await response.arrayBuffer());
    const entry={path,status:response.status,contentType:response.headers.get('content-type'),bytes:bytes.length,sha: createHash('sha256').update(bytes).digest('hex')};
    report.push(entry);
    if(response.ok&&bytes.length<2_000_000){
      const filename=path==='/'?'index.html':path.slice(1);
      await writeFile(new URL(filename,dir),bytes);
    }
  }catch(e){report.push({path,error:String(e.message||e)})}
}
await writeFile(new URL('../audit/report.json',dir),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));