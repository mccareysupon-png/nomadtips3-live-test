from pathlib import Path

path = Path('nomad-live-engine/src/index.js')
text = path.read_text(encoding='utf-8')


def replace_once(label, old, new):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}; refusing to modify index.js')
    text = text.replace(old, new, 1)
    print(f'patched: {label}')


replace_once(
    'import S8 client',
    "import {fetchOddspediaBet365Markets,oddspediaUnavailable} from './oddspedia.js';\n",
    "import {fetchOddspediaBet365Markets,oddspediaUnavailable} from './oddspedia.js';\n"
    "import {fetchS8ExternalMarkets,s8ExternalUnavailable,S8_MAX_BATCH} from './s8-external.js';\n",
)

replace_once(
    'empty state S8 health slot',
    "oddspedia:{status:'IDLE'},totalCorner:{status:'IDLE'}",
    "oddspedia:{status:'IDLE'},fiveDollarExternal:{status:'IDLE'},totalCorner:{status:'IDLE'}",
)

replace_once(
    'health bookmaker label',
    "bookmaker:'1xBet via Odds-API.io · Bet365 compare · Bet365 via Oddspedia'",
    "bookmaker:'1xBet via Odds-API.io · Bet365 compare · Bet365 via Oddspedia · Bet365 via 5DollarFootballAPI'",
)
replace_once(
    'health source label',
    "oddsSource:'Odds-API.io · The Odds API · API-Football · Oddspedia · TotalCorner fallback'",
    "oddsSource:'Odds-API.io · The Odds API · API-Football · Oddspedia · 5DollarFootballAPI · TotalCorner fallback'",
)

replace_once(
    'cycle S8 health slot',
    "oddspedia:{status:'IDLE',checked:0,mapped:0,ready:0,selected:0},totalCorner:{status:'IDLE',checked:0,ready:0,selected:0}",
    "oddspedia:{status:'IDLE',checked:0,mapped:0,ready:0,selected:0},fiveDollarExternal:{status:'IDLE',checked:0,mapped:0,ready:0,selected:0},totalCorner:{status:'IDLE',checked:0,ready:0,selected:0}",
)

replace_once(
    'start S8 in parallel after detector',
    "      const eligible=baseMatches.filter(match=>match.detectionPassed&&!match.freshness?.sourceStale);\n"
    "      const priceCandidates=baseMatches.filter(match=>!match.freshness?.sourceStale);\n",
    "      const eligible=baseMatches.filter(match=>match.detectionPassed&&!match.freshness?.sourceStale);\n"
    "      const priceCandidates=baseMatches.filter(match=>!match.freshness?.sourceStale);\n"
    "      // SOURCE 8 runs as an external sidecar only for detector-eligible matches.\n"
    "      // Start it now so its bounded wait overlaps the existing source work instead of serially delaying S1-S7.\n"
    "      const source8FetchPromise=eligible.length\n"
    "        ?fetchS8ExternalMarkets(eligible,started,fetch,{timeoutMs:4500,token:this.env.S8_ADAPTER_TOKEN||null}).then(value=>({value,error:null}),error=>({value:null,error}))\n"
    "        :null;\n",
)

s8_block = """
      const source8MarketById=new Map();
      if(!eligible.length){
        next.source.fiveDollarExternal={status:'NOT_NEEDED',checked:0,mapped:0,ready:0,selected:0,checkedAt:started};
      }else{
        try{
          const source8Fetch=await source8FetchPromise;
          if(source8Fetch?.error) throw source8Fetch.error;
          const built=source8Fetch.value;
          for(const item of built.results||[]) source8MarketById.set(item.matchId,item.market);
          for(const match of eligible.slice(S8_MAX_BATCH)) source8MarketById.set(match.id,s8ExternalUnavailable('adapter_batch_budget'));
          next.source.fiveDollarExternal={
            status:built.status,checked:built.checked,mapped:built.mapped,ready:built.ready,selected:0,
            error:built.error??null,live:built.live??null,upstream:built.upstream??null,checkedAt:started,
          };
        }catch(error){
          const reason=`price_fetch_failed:${String(error?.message||error)}`;
          next.source.fiveDollarExternal={status:'ERROR',checked:Math.min(eligible.length,S8_MAX_BATCH),mapped:0,ready:0,selected:0,error:reason,checkedAt:started};
          for(const match of eligible) source8MarketById.set(match.id,s8ExternalUnavailable(reason));
        }
      }

"""
replace_once(
    'insert isolated S8 result collection',
    "      const totalCornerMarketById=new Map();\n",
    s8_block + "      const totalCornerMarketById=new Map();\n",
)

replace_once(
    'include S8 before TotalCorner fallback decision',
    "        const source5=oddspediaMarketById.get(match.id)||oddspediaUnavailable('price_not_checked');\n"
    "        const primarySnapshots=buildPriceSourceSnapshots(\n"
    "          new Map([['source1',source1],['source2',source2],['source3',source3],['source5',source5]]),config,started\n",
    "        const source5=oddspediaMarketById.get(match.id)||oddspediaUnavailable('price_not_checked');\n"
    "        const source8=source8MarketById.get(match.id)||s8ExternalUnavailable('price_not_checked');\n"
    "        const primarySnapshots=buildPriceSourceSnapshots(\n"
    "          new Map([['source1',source1],['source2',source2],['source3',source3],['source5',source5],['source8',source8]]),config,started\n",
)

replace_once(
    'include S8 in enriched source snapshots',
    "        const source5Market=oddspediaMarketById.get(match.id)||oddspediaUnavailable(match.detectionPassed?'price_not_checked':'detection_not_ready');\n"
    "        const source4Market=totalCornerMarketById.get(match.id)||totalCornerMarketState('AH UNAVAILABLE',match.detectionPassed?'fallback_not_available':'fallback_not_needed');\n"
    "        const marketComparison=marketComparisonById.get(match.id)||{oneXBet:source1Market,bet365:marketState(COMPARE_BOOKMAKER,'ODDS NOT READY','price_not_checked')};\n"
    "        const priceSourceSnapshots=buildPriceSourceSnapshots(new Map([['source1',source1Market],['source2',source2Market],['source3',source3Market],['source5',source5Market],['source4',source4Market]]),config,started);\n",
    "        const source5Market=oddspediaMarketById.get(match.id)||oddspediaUnavailable(match.detectionPassed?'price_not_checked':'detection_not_ready');\n"
    "        const source8Market=source8MarketById.get(match.id)||s8ExternalUnavailable(match.detectionPassed?'price_not_checked':'detection_not_ready');\n"
    "        const source4Market=totalCornerMarketById.get(match.id)||totalCornerMarketState('AH UNAVAILABLE',match.detectionPassed?'fallback_not_available':'fallback_not_needed');\n"
    "        const marketComparison=marketComparisonById.get(match.id)||{oneXBet:source1Market,bet365:marketState(COMPARE_BOOKMAKER,'ODDS NOT READY','price_not_checked')};\n"
    "        const priceSourceSnapshots=buildPriceSourceSnapshots(new Map([['source1',source1Market],['source2',source2Market],['source3',source3Market],['source5',source5Market],['source8',source8Market],['source4',source4Market]]),config,started);\n",
)

replace_once(
    'publish S8 ready and selected counts',
    "      next.source.oddspedia.selected=enriched.filter(match=>match.selectedPrice?.id==='source5').length;\n"
    "      next.source.totalCorner.ready=enriched.filter(match=>match.priceSources?.find(source=>source.id==='source4')?.status==='PASS').length;\n",
    "      next.source.oddspedia.selected=enriched.filter(match=>match.selectedPrice?.id==='source5').length;\n"
    "      next.source.fiveDollarExternal.ready=enriched.filter(match=>match.priceSources?.find(source=>source.id==='source8')?.status==='PASS').length;\n"
    "      next.source.fiveDollarExternal.selected=enriched.filter(match=>match.selectedPrice?.id==='source8').length;\n"
    "      next.source.totalCorner.ready=enriched.filter(match=>match.priceSources?.find(source=>source.id==='source4')?.status==='PASS').length;\n",
)

path.write_text(text, encoding='utf-8')
print('S8 thin port applied safely: index.js changed only at guarded anchors')
