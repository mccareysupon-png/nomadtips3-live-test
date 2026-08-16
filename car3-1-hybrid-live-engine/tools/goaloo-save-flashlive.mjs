#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
const matchId=String(process.argv[2]||'2930884');
const page=`https://m.goaloo.com/football/match/live-${matchId}`;
const headers={'user-agent':'NOMADTIPS3-CAR3.1-Research/1.4 (+public Goaloo parser research)','accept':'*/*','accept-language':'en-US,en;q=.8'};
const p=await fetch(page,{headers});if(!p.ok)throw new Error(`page HTTP ${p.status}`);const html=await p.text();
const src=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)].map(m=>new URL(m[2],page).toString()).find(u=>/\/scripts\/flashlive(?:\?|$)/i.test(u));
if(!src)throw new Error('flashlive script not found');
const r=await fetch(src,{headers});if(!r.ok)throw new Error(`flashlive HTTP ${r.status}`);const js=await r.text();
await writeFile('/tmp/goaloo-flashlive.js',js,'utf8');
console.log(JSON.stringify({ok:true,matchId,scriptUrl:src.split('?')[0]+'?[version-redacted]',bytes:js.length,output:'/tmp/goaloo-flashlive.js'},null,2));
