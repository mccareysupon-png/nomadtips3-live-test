export const CONFIG_SCHEMA_VERSION = 34102;
export const CONFIG_HISTORY_LIMIT = 20;
export const HARD_ODDS_MINIMUM = 1.01;
export const HARD_ODDS_MAXIMUM = 6.00;

export const DEFAULT_CONFIG = Object.freeze({
  scanUrl: 'https://www.totalcorner.com/match/today/',
  endedUrl: 'https://www.totalcorner.com/match/today/ended',
  sourceHost: 'https://www.totalcorner.com',
  minuteFrom: 55,
  minuteTo: 88,
  rollingWindowMinutes: 5,
  scoreDifferenceFilterEnabled: false,
  maxScoreDifference: 1,
  attackWeight: 1,
  dangerousAttackWeight: 2,
  homePressureShareMinimum: 54,
  trendConditionsRequired: 2,
  homeEventRequired: true,
  sotEvidenceEnabled: true,
  sotDeltaMinimum: 1,
  shotOffEvidenceEnabled: true,
  shotOffDeltaMinimum: 1,
  cornerEvidenceEnabled: true,
  cornerDeltaMinimum: 1,
  evidenceMode: 'ANY',
  allowedLinesMode: 'ANY',
  allowedSelectionLines: [],
  oddsMinimum: 1.50,
  oddsMaximumEnabled: false,
  oddsMaximum: null,
  maximumPriceAgeSeconds: 90,
  oneSignalPerMatch: true,
  sourceStaleAfterMs: 90000,
  cycleEveryMs: 55000,
  requestTimeoutMs: 10000,
});

export const EDITABLE_KEYS = Object.freeze([
  'minuteFrom','minuteTo','rollingWindowMinutes',
  'scoreDifferenceFilterEnabled','maxScoreDifference',
  'attackWeight','dangerousAttackWeight','homePressureShareMinimum','trendConditionsRequired',
  'homeEventRequired',
  'sotEvidenceEnabled','sotDeltaMinimum','shotOffEvidenceEnabled','shotOffDeltaMinimum',
  'cornerEvidenceEnabled','cornerDeltaMinimum','evidenceMode',
  'allowedLinesMode','allowedSelectionLines','oddsMinimum',
  'oddsMaximumEnabled','oddsMaximum','maximumPriceAgeSeconds','oneSignalPerMatch'
]);

const BOOLEAN_KEYS = new Set([
  'scoreDifferenceFilterEnabled','homeEventRequired','sotEvidenceEnabled','shotOffEvidenceEnabled',
  'cornerEvidenceEnabled','oddsMaximumEnabled','oneSignalPerMatch'
]);
const NUMBER_RULES = Object.freeze({
  minuteFrom:[0,120,true], minuteTo:[0,120,true], rollingWindowMinutes:[1,15,true],
  maxScoreDifference:[0,20,true], attackWeight:[0,10,false], dangerousAttackWeight:[0,10,false],
  homePressureShareMinimum:[0,100,false], trendConditionsRequired:[1,3,true],
  sotDeltaMinimum:[1,20,true], shotOffDeltaMinimum:[1,20,true], cornerDeltaMinimum:[1,20,true],
  oddsMinimum:[HARD_ODDS_MINIMUM,HARD_ODDS_MAXIMUM,false], maximumPriceAgeSeconds:[1,3600,true],
});
const clone = value => JSON.parse(JSON.stringify(value));
const quarterGoal = value => Number.isFinite(value) && Math.abs(value * 4 - Math.round(value * 4)) < 1e-9;

export function editableConfig(config=DEFAULT_CONFIG){
  return Object.fromEntries(EDITABLE_KEYS.map(key=>[key,clone(config[key])]));
}

function validateNumber(errors,config,input,key,rules=NUMBER_RULES[key]){
  const [min,max,integer]=rules;
  const value=Number(input[key]);
  if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value))){
    errors.push(`${key} must be ${integer?'a whole number':'a number'} from ${min} to ${max}`);
    return;
  }
  config[key]=value;
}

export function validateEditableConfig(input={},options={}){
  const requireAll=options.requireAll===true;
  const errors=[];
  const config=editableConfig(DEFAULT_CONFIG);
  if(!input||typeof input!=='object'||Array.isArray(input)) return {ok:false,errors:['config must be an object'],config:null};
  const unknown=Object.keys(input).filter(key=>!EDITABLE_KEYS.includes(key));
  if(unknown.length) errors.push(`unknown settings: ${unknown.join(', ')}`);
  if(requireAll){
    const missing=EDITABLE_KEYS.filter(key=>!(key in input));
    if(missing.length) errors.push(`missing settings: ${missing.join(', ')}`);
  }
  for(const key of Object.keys(NUMBER_RULES)) if(key in input) validateNumber(errors,config,input,key);
  for(const key of BOOLEAN_KEYS){
    if(!(key in input)) continue;
    if(typeof input[key]!=='boolean') errors.push(`${key} must be true or false`);
    else config[key]=input[key];
  }
  if('evidenceMode' in input){
    const value=String(input.evidenceMode).trim().toUpperCase();
    if(!['ANY','ALL'].includes(value)) errors.push('evidenceMode must be ANY or ALL');
    else config.evidenceMode=value;
  }
  if('allowedLinesMode' in input){
    const value=String(input.allowedLinesMode).trim().toUpperCase();
    if(!['ANY','SELECTED'].includes(value)) errors.push('allowedLinesMode must be ANY or SELECTED');
    else config.allowedLinesMode=value;
  }
  if('allowedSelectionLines' in input){
    const raw=Array.isArray(input.allowedSelectionLines)?input.allowedSelectionLines:String(input.allowedSelectionLines??'').split(',').map(value=>value.trim()).filter(Boolean);
    const parsed=raw.map(Number);
    if(parsed.some(value=>!Number.isFinite(value)||value < -10||value > 10||!quarterGoal(value))){
      errors.push('allowedSelectionLines must contain only quarter-goal HOME lines from -10 to +10');
    }else config.allowedSelectionLines=[...new Set(parsed)].sort((a,b)=>a-b);
  }
  if('oddsMaximum' in input){
    const raw=input.oddsMaximum;
    if(raw===null||raw===''||typeof raw==='undefined') config.oddsMaximum=null;
    else validateNumber(errors,config,{oddsMaximum:raw},'oddsMaximum',[HARD_ODDS_MINIMUM,HARD_ODDS_MAXIMUM,false]);
  }
  if(config.minuteFrom>config.minuteTo) errors.push('Minute From must not be later than Minute To');
  if(config.attackWeight===0&&config.dangerousAttackWeight===0) errors.push('Attack Weight and Dangerous Attack Weight cannot both be zero');
  if(config.homeEventRequired&&!config.sotEvidenceEnabled&&!config.shotOffEvidenceEnabled&&!config.cornerEvidenceEnabled) errors.push('Enable at least one HOME evidence type while New HOME Event is required');
  if(config.allowedLinesMode==='SELECTED'&&!config.allowedSelectionLines.length) errors.push('Choose at least one HOME AH line or use ANY');
  if(config.oddsMaximumEnabled){
    if(config.oddsMaximum==null) errors.push('Maximum Odds is required when its switch is enabled');
    else if(config.oddsMinimum>config.oddsMaximum) errors.push('Minimum Odds must not be greater than Maximum Odds');
  }else config.oddsMaximum=null;
  return {ok:errors.length===0,errors,config:errors.length?null:config};
}

export function engineConfig(editable=DEFAULT_CONFIG){
  return {...DEFAULT_CONFIG,...clone(editable),allowedSelectionLines:[...(editable.allowedSelectionLines||[])]};
}
