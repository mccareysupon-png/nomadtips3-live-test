export const DEFAULT_CONFIG = Object.freeze({
  scanUrl: 'https://www.totalcorner.com/match/today/',
  endedUrl: 'https://www.totalcorner.com/match/today/ended',
  sourceHost: 'https://www.totalcorner.com',
  minuteFrom: 55,
  minuteTo: 80,
  watchMinuteFrom: 45,
  watchMinuteTo: 88,
  maxScoreDifference: 1,
  attackDifference: 15,
  dangerousAttackDifference: 10,
  dangerousAttackRatio: 1.30,
  shotsOnTargetMinimum: 4,
  shotsOnTargetDifference: 2,
  cornersMinimum: 4,
  momentumMinimum: 70,
  allowedSelectionLines: [0, -0.25, -0.5, -0.75, -1],
  oddsMinimum: 1.70,
  oddsMaximum: 2.10,
  staleAfterMs: 90000,
  cycleEveryMs: 55000,
  maxWatchMatches: 24,
  maxNearOddsMatches: 12,
  requestTimeoutMs: 10000,
  oneSignalPerMatch: true,
});

export const EDITABLE_KEYS = Object.freeze([
  'minuteFrom','minuteTo','watchMinuteFrom','watchMinuteTo','maxScoreDifference',
  'attackDifference','dangerousAttackDifference','dangerousAttackRatio',
  'shotsOnTargetMinimum','shotsOnTargetDifference','cornersMinimum','momentumMinimum',
  'allowedSelectionLines','oddsMinimum','oddsMaximum','maxWatchMatches','maxNearOddsMatches'
]);

const NUMBER_RULES = Object.freeze({
  minuteFrom:[0,120,true], minuteTo:[0,120,true], watchMinuteFrom:[0,120,true], watchMinuteTo:[0,120,true],
  maxScoreDifference:[0,20,true], attackDifference:[0,250,true], dangerousAttackDifference:[0,250,true],
  dangerousAttackRatio:[1,5,false], shotsOnTargetMinimum:[0,50,true], shotsOnTargetDifference:[0,50,true],
  cornersMinimum:[0,30,true], momentumMinimum:[0,100,true], oddsMinimum:[1.01,20,false], oddsMaximum:[1.01,20,false],
  maxWatchMatches:[1,100,true], maxNearOddsMatches:[1,100,true]
});

export function editableConfig(config=DEFAULT_CONFIG){
  return Object.fromEntries(EDITABLE_KEYS.map(k=>[k,Array.isArray(config[k])?[...config[k]]:config[k]]));
}

export function validateEditableConfig(input={}){
  const errors=[];
  const config=editableConfig(DEFAULT_CONFIG);
  for(const [key,[min,max,integer]] of Object.entries(NUMBER_RULES)){
    if(!(key in input)) continue;
    const n=Number(input[key]);
    if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n))){errors.push(`${key} must be ${integer?'an integer':'a number'} between ${min} and ${max}`);continue;}
    config[key]=n;
  }
  if('allowedSelectionLines' in input){
    const raw=Array.isArray(input.allowedSelectionLines)?input.allowedSelectionLines:String(input.allowedSelectionLines).split(',');
    const lines=[...new Set(raw.map(Number).filter(Number.isFinite))];
    if(!lines.length||lines.some(x=>x < -5||x > 5||Math.abs(x*4-Math.round(x*4))>1e-9)) errors.push('allowedSelectionLines must contain quarter-goal values between -5 and 5');
    else config.allowedSelectionLines=lines;
  }
  if(config.minuteFrom>config.minuteTo) errors.push('minuteFrom must be less than or equal to minuteTo');
  if(config.watchMinuteFrom>config.watchMinuteTo) errors.push('watchMinuteFrom must be less than or equal to watchMinuteTo');
  if(config.oddsMinimum>config.oddsMaximum) errors.push('oddsMinimum must be less than or equal to oddsMaximum');
  if(config.maxNearOddsMatches>config.maxWatchMatches) errors.push('maxNearOddsMatches must be less than or equal to maxWatchMatches');
  return {ok:errors.length===0,errors,config};
}
