// Safety gate before adding a monitor workflow to default branch.
// Lists workflows that can execute on ANY main push without paths restrictions.
// No writes or secrets.
import {readdir,readFile} from 'node:fs/promises';
const root='.github/workflows';
let broad=[];
for(const file of await readdir(root)){
 if(!/\.ya?ml$/.test(file))continue;
 const src=await readFile(root+'/'+file,'utf8');
 const lines=src.split(/\r?\n/);
 const on=lines.findIndex(x=>/^on:\s*(?:#.*)?$/.test(x));
 if(on<0)continue;
 let block=[],end=lines.length;
 for(let i=on+1;i<lines.length;i++)if(/^\S/.test(lines[i])&&!/^\s*#/.test(lines[i])){end=i;break;}
 block=lines.slice(on+1,end);
 const pushIndex=block.findIndex(x=>/^\s{2}push:\s*$/.test(x));
 if(pushIndex<0)continue;
 const sub=[];for(let i=pushIndex+1;i<block.length;i++){if(/^\s{2}[A-Za-z_-]+:/.test(block[i]))break;sub.push(block[i]);}
 const body=sub.join('\n');
 const mentionsMain=!/branches:/.test(body)||/\bmain\b/.test(body);
 const pathScoped=/\bpaths:\s*|paths-ignore:\s*/.test(body);
 if(mentionsMain&&!pathScoped)broad.push({file,condition:'push to main without path filter'});
}
console.log('BALL46_MAIN_PUSH_RISK='+JSON.stringify({count:broad.length,suspects:broad.slice(0,75)}));
