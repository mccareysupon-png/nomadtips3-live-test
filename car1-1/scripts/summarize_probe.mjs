import fs from 'node:fs/promises';
const src = JSON.parse(await fs.readFile('car1-1/data/goaloo-probe.json','utf8'));
const rows=(src.rows||[]).map(r=>({index:r.index,text:r.text,attrs:r.attrs,links:r.links,cells:r.cells}));
const likely=rows.filter(r=>Array.isArray(r.cells)&&r.cells.length>=4).slice(0,80);
const out={httpStatus:src.httpStatus,title:src.title,url:src.url,rowCount:src.rowCount,bodyText:(src.bodyText||'').slice(0,18000),likelyRows:likely,anchors:(src.anchors||[]).slice(0,100)};
await fs.writeFile('car1-1/data/feed-diagnostic.json',JSON.stringify(out,null,2)+'\n');
console.log(`wrote ${likely.length} likely rows`);
