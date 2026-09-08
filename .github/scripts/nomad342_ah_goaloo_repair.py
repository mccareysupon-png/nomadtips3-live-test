from pathlib import Path
import re
import textwrap

OLD_WORKFLOW = Path('.github/workflows/nomad342-ah-goaloo-market-lock-patch.yml')
REPAIR_WORKFLOW = Path('.github/workflows/nomad342-ah-goaloo-market-lock-repair.yml')
SELF = Path('.github/scripts/nomad342_ah_goaloo_repair.py')

raw = OLD_WORKFLOW.read_text(encoding='utf-8')
m = re.search(r"python3 - <<'PY'\n(.*?)\n\s+PY\n", raw, re.S)
if not m:
    raise SystemExit('cannot extract original patch script')
script = textwrap.dedent(m.group(1))
exec(compile(script, '<nomad342-ah-original-patch>', 'exec'), {})

path = Path('workers/nomadtips3-342-ledger/src/index.js')
s = path.read_text(encoding='utf-8')
replacement = '''function validateSettings(cfg,kind,errors,prefix){
  const oddsMin=finite(cfg?.oddsMin),from=finite(cfg?.minuteFrom),to=finite(cfg?.minuteTo),rolling=finite(cfg?.rollingWindowMinutes),required=finite(cfg?.evidenceRequired);
  if(oddsMin===null||oddsMin<1.01||oddsMin>20)errors.push(`${prefix}.settings.oddsMin`);
  if(from===null||to===null||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>120||from>to)errors.push(`${prefix}.settings.minute`);
  if(rolling===null||!Number.isInteger(rolling)||rolling<2||rolling>30)errors.push(`${prefix}.settings.rolling`);
  if(required===null||!Number.isInteger(required)||required<1||required>6)errors.push(`${prefix}.settings.evidenceRequired`);
  for(const key of ['shotOnTarget','shotOff','corner']){const n=finite(cfg?.[key]);if(n===null||n<0||n>50)errors.push(`${prefix}.settings.${key}`);}
  for(const key of ['dangerousAttackPct','attackPct','possessionPct']){const n=finite(cfg?.[key]);if(n===null||n<0||n>100)errors.push(`${prefix}.settings.${key}`);}
  if(kind==='AH'){const lineMin=finite(cfg?.lineMin);if(lineMin===null||lineMin<-10||lineMin>10||!Number.isInteger(lineMin*4))errors.push(`${prefix}.settings.lineMin`);}
  else if(kind!=='1X2'){const lineMin=finite(cfg?.lineMin);if(lineMin===null||lineMin<.5||lineMin>10||!Number.isInteger(lineMin*2))errors.push(`${prefix}.settings.lineMin`);}
  if(kind==='1X2'){const gap=finite(cfg?.scoreTrailingMax),mode=String(cfg?.sideMode||'').toUpperCase();if(gap===null||!Number.isInteger(gap)||gap<0||gap>10)errors.push(`${prefix}.settings.scoreTrailingMax`);if(!['HOME','AWAY','BOTH'].includes(mode))errors.push(`${prefix}.settings.sideMode`);}
  if(['UNDER','AH'].includes(kind)&&!['HOME','AWAY','BOTH'].includes(String(cfg?.sideMode||'').toUpperCase()))errors.push(`${prefix}.settings.sideMode`);
}
function validateSignal(signal,base,errors,index){
  const prefix=`signals.${index}`,kind=String(signal?.market||'').toUpperCase(),pick=String(signal?.pick||'').toUpperCase(),cfg=signal?.settings||{},gate=signal?.gate||{};
  if(!['1X2','OVER','UNDER','AH'].includes(kind)){errors.push(`${prefix}.market`);return null;}
  validateSettings(cfg,kind,errors,prefix);
  if(gate?.pass!==true)errors.push(`${prefix}.gate`);
  if(base.minute<Number(cfg.minuteFrom)||base.minute>Number(cfg.minuteTo))errors.push(`${prefix}.minute`);
  const odds=finite(signal?.odds);if(odds===null||odds<Number(cfg.oddsMin)||odds>100)errors.push(`${prefix}.odds`);
  const evidence=gate?.evidence;
  if(kind==='1X2'){
    if(!['HOME','AWAY'].includes(pick))errors.push(`${prefix}.pick`);
    const sideMode=String(cfg.sideMode||'BOTH').toUpperCase();if(sideMode!=='BOTH'&&sideMode!==pick)errors.push(`${prefix}.sideMode`);
    const selected=evidence?.values||evidence?.sides?.[pick]?.values||null,check=countEvidence(selected,cfg,'MIN');if(check.required<1||check.passCount<check.required)errors.push(`${prefix}.evidence`);
    const trailing=pick==='HOME'?Math.max(0,Number(base.entryScore.away)-Number(base.entryScore.home)):Math.max(0,Number(base.entryScore.home)-Number(base.entryScore.away));if(trailing>Number(cfg.scoreTrailingMax))errors.push(`${prefix}.scoreTrailingMax`);
    return {market:'1X2',pick,odds,probability:finite(signal?.probability),home:finite(signal?.home),away:finite(signal?.away),settings:{...cfg},gate};
  }
  if(kind==='AH'){
    if(!['HOME','AWAY'].includes(pick))errors.push(`${prefix}.pick`);
    const sideMode=String(cfg.sideMode||'BOTH').toUpperCase();if(sideMode!=='BOTH'&&sideMode!==pick)errors.push(`${prefix}.sideMode`);
    const line=finite(signal?.line),rawLine=finite(signal?.rawLine);if(line===null||line<Number(cfg.lineMin)||line<-20||line>20||!Number.isInteger(line*4))errors.push(`${prefix}.line`);
    if(rawLine===null||!Number.isInteger(rawLine*4))errors.push(`${prefix}.rawLine`);else{const expected=pick==='AWAY'?-rawLine:rawLine;if(Math.abs(expected-line)>1e-9)errors.push(`${prefix}.linePerspective`);}
    const homeOdds=finite(signal?.homeOdds),awayOdds=finite(signal?.awayOdds),rawHomeHk=finite(signal?.rawHomeHk),rawAwayHk=finite(signal?.rawAwayHk),selectedTeamOdds=pick==='HOME'?homeOdds:awayOdds;
    if(homeOdds===null||awayOdds===null||rawHomeHk===null||rawAwayHk===null)errors.push(`${prefix}.priceAudit`);
    if(selectedTeamOdds===null||Math.abs(selectedTeamOdds-odds)>1e-6)errors.push(`${prefix}.oddsSide`);
    if(rawHomeHk!==null&&homeOdds!==null&&Math.abs((1+rawHomeHk)-homeOdds)>1e-6)errors.push(`${prefix}.homeHkDecimal`);
    if(rawAwayHk!==null&&awayOdds!==null&&Math.abs((1+rawAwayHk)-awayOdds)>1e-6)errors.push(`${prefix}.awayHkDecimal`);
    const selected=evidence?.sides?.[pick]?.values||evidence?.values||null,check=countEvidence(selected,cfg,'MIN');if(check.required<1||check.passCount<check.required)errors.push(`${prefix}.evidence`);
    return {market:'AH',marketLabel:'Asian Handicap',pick,line,rawLine,odds,homeOdds,awayOdds,rawHomeHk,rawAwayHk,probability:finite(signal?.probability),bookmaker:clean(signal?.bookmaker,80)||null,provider:clean(signal?.provider,80)||null,settings:{...cfg},gate};
  }
  if(pick!==kind)errors.push(`${prefix}.pick`);const line=finite(signal?.line);if(line===null||line<Number(cfg.lineMin)||line>20||!Number.isInteger(line*4))errors.push(`${prefix}.line`);
  if(kind==='OVER'){
    const home=countEvidence(evidence?.sides?.HOME?.values,cfg,'MIN'),away=countEvidence(evidence?.sides?.AWAY?.values,cfg,'MIN');if(home.passCount<home.required&&away.passCount<away.required)errors.push(`${prefix}.evidence`);
  }else{
    const mode=String(cfg.sideMode||'BOTH').toUpperCase(),home=countEvidence(evidence?.sides?.HOME?.values,cfg,'MAX'),away=countEvidence(evidence?.sides?.AWAY?.values,cfg,'MAX'),hp=home.passCount>=home.required,ap=away.passCount>=away.required;if((mode==='HOME'&&!hp)||(mode==='AWAY'&&!ap)||(mode==='BOTH'&&!(hp&&ap)))errors.push(`${prefix}.evidence`);
  }
  return {market:kind,pick:kind,line,odds,probability:finite(signal?.probability),over:finite(signal?.over),under:finite(signal?.under),settings:{...cfg},gate};
}
function validateV3Lock'''

s2, count = re.subn(
    r"function validateSettings\(cfg,kind,errors,prefix\)\{.*?\nfunction validateV3Lock",
    replacement,
    s,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f'validator repair expected 1 match, got {count}')
path.write_text(s2, encoding='utf-8', newline='\n')

# Temporary automation files must not remain in the final product diff.
for p in (REPAIR_WORKFLOW, SELF):
    p.unlink(missing_ok=True)
