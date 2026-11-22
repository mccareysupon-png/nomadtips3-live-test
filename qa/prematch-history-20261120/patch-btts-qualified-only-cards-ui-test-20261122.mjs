// BALL46 Pre-Match BTTS TEST: show only fully qualified, actually issued
// BTTS picks in Statistics > BTTS. Never show probability-screened
// WAITING_PRICE or NOT_OFFERED fixtures as prediction cards.
// NO backend/model/price/ledger/statistics/1X2 modifications.
export const B46_BTTS_QUALIFIED_CARDS_ONLY_V1='B46_BTTS_QUALIFIED_CARDS_ONLY_V1';
function exactOnce(source,oldCode,newCode,label){
 const n=source.split(oldCode).length-1;
 if(n!==1)throw Error('BTTS_QUALIFIED_ONLY_ANCHOR_'+label+'_'+n);
 return source.replace(oldCode,newCode);
}
export function patchBttsQualifiedCardsOnly(client){
 if(typeof client!=='string'||
   !client.includes("const activeLedger=mode==='btts'?(bttsLedger??ledger)")||
   !client.includes("function premiumMatchRow(item,hub,stale){")||
   !client.includes("function makeBttsCandidatesSection(){")||
   !client.includes("if(mode==='btts'&&!existingContent)content.append(makeBttsCandidatesSection());")||
   !client.includes("if(mode==='btts')loadBttsScreening();"))
   throw Error('MISSING_ACTIVE_PREMATCH_TEST_BTTS_CLIENT');
 let result=client;
 result=exactOnce(result,
    "    if(mode==='btts'&&!existingContent)content.append(makeBttsCandidatesSection());",
    "    // BTTS Statistics cards come ONLY from bttsLedger issued predictions.\n"+
    "    // Screening candidates have NO place in the prediction list.",
    'REMOVE_UNQUALIFIED_CANDIDATES_SECTION');
 result=exactOnce(result,
    "    if(mode==='btts')loadBttsScreening();",
    "    // Only issued, price-qualified BTTS picks are shown; no preview fetch.",
    'REMOVE_SCREENING_PREVIEW_FETCH');
 const oldEmpty=[
    "if(mode==='btts'){",
    "      // Distinguish BTTS data readiness from issued BTTS predictions.",
    "      const readiness=el('p','b46pm-empty',bttsScreeningLabel());",
    "      readiness.id='b46pm-btts-readiness';",
    "      readiness.setAttribute('role','status');",
    "      list.append(readiness);",
    "    }",
    "    if(!visible.length&&mode!=='btts')",
    "      list.append(el('p','b46pm-empty','No matches in this view.'));"
 ].join('\n');
 const newEmpty=[
   "if(!visible.length)",
   "      list.append(el('p','b46pm-empty',",
   "        mode==='btts'?'No qualified BTTS predictions yet.':'No matches in this view.'));"
 ].join('\n');
 result=exactOnce(result,oldEmpty,newEmpty,'ONLY_ISSUED_PICKS_AND_HONEST_EMPTY');
 if(!result.includes("const activeLedger=mode==='btts'?(bttsLedger??ledger)")||
    !result.includes("mode==='btts'?'No qualified BTTS predictions yet.'")||
    result.includes("content.append(makeBttsCandidatesSection())")||
    result.includes("if(mode==='btts')loadBttsScreening();"))
   throw Error('BTTS_QUALIFIED_ONLY_PATCH_INVALID');
 return {code:result,onlyRecordedQualifiedBttsCards:true,
    old1X2AndPredictionsRowsUnchanged:true,readinessDiagnosticsRemovedFromCards:true,
    backendUntouched:true,modelUntouched:true,priceConditionsUntouched:true,
    paidProviderCalls:0};
}
