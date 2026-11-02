const B46_LEDGER_REPAIR_PLAN=__PLAN_JSON__;
const B46_LEDGER_IMMUTABLE=['fixtureId','league','home','away','market','marketLabel','providerMarket','period','selection','line','selectionLine','providerLine','providerLineSide','odds','bookmaker','bookmakerSlug','priceStage','priceSource','priceReference','referenceProviderLine','refereeBookCount','refereeOfferCount','refereeConsensusBooks','refereeConsensusSlugs','openingPrice','closingPrice','inplayPrice','entryMinute','minute','entryScore','scoreAt','entryCorners','entryCards','entryStats','statisticsAtEntry','bookmakerHistory','evidence','rolling','settlementBasis','lineGap'];
function b46LedgerCanonical(value){if(Array.isArray(value))return value.map(b46LedgerCanonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,b46LedgerCanonical(value[k])]));return value}
function b46LedgerString(value){return JSON.stringify(b46LedgerCanonical(value))}
function b46LedgerObservation(row){return b46LedgerString(Object.fromEntries(B46_LEDGER_IMMUTABLE.map(k=>[k,row?.[k]??null])))}
async function b46LedgerHash(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b46LedgerString(value)));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}
function b46LedgerCheck(value,message){if(!value)throw new Error('B46_LEDGER_REPAIR_'+message)}
