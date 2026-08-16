import fs from 'node:fs/promises';
import { buildMarketPredictions, settleMarkets } from './market_helpers.mjs';

const CURRENT=process.env.CURRENT_PATH||'data/prematch-current.json';
const data=JSON.parse(await fs.readFile(CURRENT,'utf8'));
let changed=0;
for(const match of data.matches||[]){
  const before=JSON.stringify(match.markets||null);
  if(!match.markets||!Object.keys(match.markets).length)match.markets=buildMarketPredictions(match);
  if(match.finalScore&&/^\d+\s*-\s*\d+$/.test(match.finalScore)){
    const [hg,ag]=match.finalScore.split('-').map(Number);settleMarkets(match,hg,ag,match.settledAtUtc||new Date().toISOString());
  }
  if(before!==JSON.stringify(match.markets||null))changed++;
}
data.marketSchema=2;
data.marketCatalog=['1X2','AH','BTTS','OU','DC','OE'];
if(changed)await fs.writeFile(CURRENT,JSON.stringify(data,null,2)+'\n');
console.log(`market upgrade: ${changed}/${(data.matches||[]).length} matches updated`);
