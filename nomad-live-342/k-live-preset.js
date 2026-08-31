(()=>{
'use strict';
const eventDefaults=window.NOMAD342_CONFIG?.defaults||{};
const freeze=value=>Object.freeze(value);
window.NOMAD342_K_LIVE_PRESET=freeze({
  version:'k-live-net-v1',
  name:'K LIVE',
  locked:true,
  scope:'ALL_LIVE_MATCHES',
  event:freeze({
    minuteFrom:Number(eventDefaults.minuteFrom??55),
    minuteTo:Number(eventDefaults.minuteTo??88),
    rollingWindowMinutes:Number(eventDefaults.rollingWindowMinutes??5),
    homePressureShareMinimum:Number(eventDefaults.homePressureShareMinimum??54),
    trendConditionsRequired:Number(eventDefaults.trendConditionsRequired??2),
    evidenceMode:String(eventDefaults.evidenceMode||'ANY'),
    sotDeltaMinimum:Number(eventDefaults.sotDeltaMinimum??1),
    shotOffDeltaMinimum:Number(eventDefaults.shotOffDeltaMinimum??1),
    cornerDeltaMinimum:Number(eventDefaults.cornerDeltaMinimum??1),
  }),
  market:freeze({
    ah:'AUTO_MAIN_LINE',
    oneXtwo:'AUTO',
    totals:'AUTO_MAIN_LINE',
    maxAgeMs:30000,
    minReferees:3,
    moderateShare:0.58,
    strongShare:0.65,
    directionalMarkets:freeze(['AH','1X2']),
    totalsRole:'CONTEXT',
  }),
  grading:freeze({
    eventPassRequired:true,
    strongRequiresBothDirectional:true,
    strongRequiresAtLeastOneStrong:true,
    awayAhIsConflict:true,
    away1X2StrongIsConflict:true,
    draw1X2IsNeutral:true,
  }),
  behavior:freeze({
    failOpen:true,
    blocksLiveScore:false,
    blocksEventGate:false,
    changesPrediction:false,
    marketOfflineStatus:'EVENT ONLY',
  }),
});
})();
