export const ENGINE3_BASE_DEFAULTS = Object.freeze({
  side: 'HOME',
  minuteMin: 60,
  minuteMax: 80,
  market: 'WIN',
  oddsMin: 1.70,
  oddsMax: null,
  ahMin: 0.25,
  ahMax: null,
  momentumMin: 60,
  attackEvidenceEnabled: true,
  attackEvidenceDetailedConfigured: true,
  attackEvidenceDangerousAttacksEnabled: true,
  attackEvidenceDangerousAttacksMin: 1,
  attackEvidenceShotsEnabled: true,
  attackEvidenceShotsMin: 1,
  attackEvidenceShotsOnTargetEnabled: true,
  attackEvidenceShotsOnTargetMin: 1,
  attackEvidenceCornersEnabled: true,
  attackEvidenceCornersMin: 1,
  attackEvidenceRequirement: '1',
  goalGapLimited: false,
  maxGoalGap: 1,
  confirmationRounds: 2,
  signalLimitEnabled: false,
  maxSignalsPerDay: 10
});

// Current owner decision: CAR 3.1 runs Goaloo-only in Shadow mode.
// API-Football / backup adapters are not deleted; they stay dormant for a future
// architecture change, but normalizeCar31Config pins them OFF so old browser
// settings cannot silently reactivate upstream API usage.
export const CAR31_SOURCE_MODE = Object.freeze({
  locked: true,
  primary: 'GOALOO',
  fallback: 'OFF',
  backup: 'OFF',
  apiVerifyPolicy: 'OFF',
  dataConflictPolicy: 'PASS'
});

export const CAR31_DEFAULT_CONFIG = Object.freeze({
  ...ENGINE3_BASE_DEFAULTS,
  engineMode: 'SHADOW',
  sourcePrimary: CAR31_SOURCE_MODE.primary,
  sourceFallback: CAR31_SOURCE_MODE.fallback,
  sourceBackup: CAR31_SOURCE_MODE.backup,
  sourceRefreshSeconds: 30,
  sourceFreshnessMaxSeconds: 90,
  matchConfidenceMin: 85,
  requireCoreStats: true,
  apiVerifyPolicy: CAR31_SOURCE_MODE.apiVerifyPolicy,
  dataConflictPolicy: CAR31_SOURCE_MODE.dataConflictPolicy,
  market: 'WIN',
  ouDirection: 'OVER',
  ouLine: 2.5,
  trendWindowMinutes: 15,
  chartHistoryMinutes: 30,
  pressureSpikeEnabled: false,
  pressureSpikeMin: 12,
  redCardPolicy: 'ALLOW',
  maxSourceMismatchPercent: 25,
  momentumWeights: Object.freeze({
    attacks: 0.16,
    dangerous_attacks: 0.52,
    shots: 2,
    shots_on_target: 4,
    corners: 1.25,
    possession: 0.07
  })
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function bounded(value, fallback, min, max, step = null) {
  const parsed = numberOrNull(value);
  let result = parsed === null ? fallback : Math.max(min, Math.min(max, parsed));
  if (step) result = Math.round(result / step) * step;
  return Number(result.toFixed(6));
}

function integer(value, fallback, min, max) {
  return Math.round(bounded(value, fallback, min, max));
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function enumValue(value, allowed, fallback) {
  const normalized = String(value ?? fallback).trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function optionalBounded(value, min, max, step = null) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : bounded(parsed, parsed, min, max, step);
}

function normalizeWeights(input = {}) {
  const defaults = CAR31_DEFAULT_CONFIG.momentumWeights;
  return {
    attacks: bounded(input.attacks, defaults.attacks, 0, 20, 0.01),
    dangerous_attacks: bounded(input.dangerous_attacks, defaults.dangerous_attacks, 0, 20, 0.01),
    shots: bounded(input.shots, defaults.shots, 0, 20, 0.01),
    shots_on_target: bounded(input.shots_on_target, defaults.shots_on_target, 0, 20, 0.01),
    corners: bounded(input.corners, defaults.corners, 0, 20, 0.01),
    possession: bounded(input.possession, defaults.possession, 0, 2, 0.01)
  };
}

export function normalizeCar31Config(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const minuteMin = integer(source.minuteMin, CAR31_DEFAULT_CONFIG.minuteMin, 1, 119);
  const minuteMax = integer(source.minuteMax, CAR31_DEFAULT_CONFIG.minuteMax, minuteMin, 120);
  const oddsMin = bounded(source.oddsMin, CAR31_DEFAULT_CONFIG.oddsMin, 1.01, 100, 0.01);
  const oddsMax = optionalBounded(source.oddsMax, oddsMin, 100, 0.01);
  const ahMin = bounded(source.ahMin, CAR31_DEFAULT_CONFIG.ahMin, -5, 5, 0.25);
  const ahMax = optionalBounded(source.ahMax, ahMin, 5, 0.25);
  const attackEvidenceRequirement = enumValue(source.attackEvidenceRequirement, ['1', '2', '3', 'ALL'], '1');

  const sourcePrimary = CAR31_SOURCE_MODE.locked
    ? CAR31_SOURCE_MODE.primary
    : enumValue(source.sourcePrimary, ['GOALOO', 'API_FOOTBALL', 'ALERTS_BET'], CAR31_DEFAULT_CONFIG.sourcePrimary);
  const sourceFallback = CAR31_SOURCE_MODE.locked
    ? CAR31_SOURCE_MODE.fallback
    : enumValue(source.sourceFallback, ['API_FOOTBALL', 'GOALOO', 'ALERTS_BET', 'OFF'], CAR31_DEFAULT_CONFIG.sourceFallback);
  const sourceBackup = CAR31_SOURCE_MODE.locked
    ? CAR31_SOURCE_MODE.backup
    : enumValue(source.sourceBackup, ['ALERTS_BET', 'API_FOOTBALL', 'GOALOO', 'OFF'], CAR31_DEFAULT_CONFIG.sourceBackup);
  const apiVerifyPolicy = CAR31_SOURCE_MODE.locked
    ? CAR31_SOURCE_MODE.apiVerifyPolicy
    : enumValue(source.apiVerifyPolicy, ['ALWAYS', 'CANDIDATE_ONLY', 'SIGNAL_ONLY', 'OFF'], CAR31_DEFAULT_CONFIG.apiVerifyPolicy);
  const dataConflictPolicy = CAR31_SOURCE_MODE.locked
    ? CAR31_SOURCE_MODE.dataConflictPolicy
    : enumValue(source.dataConflictPolicy, ['PASS', 'USE_PRIMARY', 'USE_API'], CAR31_DEFAULT_CONFIG.dataConflictPolicy);

  return {
    engineMode: 'SHADOW',
    side: enumValue(source.side, ['HOME', 'AWAY', 'BOTH'], CAR31_DEFAULT_CONFIG.side),
    minuteMin,
    minuteMax,
    market: enumValue(source.market, ['WIN', 'AH', 'OU'], CAR31_DEFAULT_CONFIG.market),
    oddsMin,
    oddsMax,
    ahMin,
    ahMax,
    ouDirection: enumValue(source.ouDirection, ['OVER', 'UNDER'], CAR31_DEFAULT_CONFIG.ouDirection),
    ouLine: bounded(source.ouLine, CAR31_DEFAULT_CONFIG.ouLine, 0.5, 8.5, 0.25),
    momentumMin: integer(source.momentumMin, CAR31_DEFAULT_CONFIG.momentumMin, 1, 99),
    momentumWeights: normalizeWeights(source.momentumWeights || {}),
    attackEvidenceEnabled: booleanValue(source.attackEvidenceEnabled, CAR31_DEFAULT_CONFIG.attackEvidenceEnabled),
    attackEvidenceDetailedConfigured: true,
    attackEvidenceDangerousAttacksEnabled: booleanValue(source.attackEvidenceDangerousAttacksEnabled, true),
    attackEvidenceDangerousAttacksMin: integer(source.attackEvidenceDangerousAttacksMin, 1, 1, 999),
    attackEvidenceShotsEnabled: booleanValue(source.attackEvidenceShotsEnabled, true),
    attackEvidenceShotsMin: integer(source.attackEvidenceShotsMin, 1, 1, 999),
    attackEvidenceShotsOnTargetEnabled: booleanValue(source.attackEvidenceShotsOnTargetEnabled, true),
    attackEvidenceShotsOnTargetMin: integer(source.attackEvidenceShotsOnTargetMin, 1, 1, 999),
    attackEvidenceCornersEnabled: booleanValue(source.attackEvidenceCornersEnabled, true),
    attackEvidenceCornersMin: integer(source.attackEvidenceCornersMin, 1, 1, 999),
    attackEvidenceRequirement,
    goalGapLimited: booleanValue(source.goalGapLimited, CAR31_DEFAULT_CONFIG.goalGapLimited),
    maxGoalGap: integer(source.maxGoalGap, CAR31_DEFAULT_CONFIG.maxGoalGap, 0, 20),
    confirmationRounds: integer(source.confirmationRounds, CAR31_DEFAULT_CONFIG.confirmationRounds, 1, 10),
    signalLimitEnabled: booleanValue(source.signalLimitEnabled, CAR31_DEFAULT_CONFIG.signalLimitEnabled),
    maxSignalsPerDay: integer(source.maxSignalsPerDay, CAR31_DEFAULT_CONFIG.maxSignalsPerDay, 1, 100),
    sourcePrimary,
    sourceFallback,
    sourceBackup,
    sourceRefreshSeconds: integer(source.sourceRefreshSeconds, CAR31_DEFAULT_CONFIG.sourceRefreshSeconds, 10, 300),
    sourceFreshnessMaxSeconds: integer(source.sourceFreshnessMaxSeconds, CAR31_DEFAULT_CONFIG.sourceFreshnessMaxSeconds, 15, 600),
    matchConfidenceMin: integer(source.matchConfidenceMin, CAR31_DEFAULT_CONFIG.matchConfidenceMin, 50, 100),
    requireCoreStats: booleanValue(source.requireCoreStats, CAR31_DEFAULT_CONFIG.requireCoreStats),
    apiVerifyPolicy,
    dataConflictPolicy,
    trendWindowMinutes: integer(source.trendWindowMinutes, CAR31_DEFAULT_CONFIG.trendWindowMinutes, 3, 60),
    chartHistoryMinutes: integer(source.chartHistoryMinutes, CAR31_DEFAULT_CONFIG.chartHistoryMinutes, 5, 120),
    pressureSpikeEnabled: booleanValue(source.pressureSpikeEnabled, CAR31_DEFAULT_CONFIG.pressureSpikeEnabled),
    pressureSpikeMin: integer(source.pressureSpikeMin, CAR31_DEFAULT_CONFIG.pressureSpikeMin, 1, 100),
    redCardPolicy: enumValue(source.redCardPolicy, ['ALLOW', 'REJECT_SELECTED', 'REJECT_ANY'], CAR31_DEFAULT_CONFIG.redCardPolicy),
    maxSourceMismatchPercent: integer(source.maxSourceMismatchPercent, CAR31_DEFAULT_CONFIG.maxSourceMismatchPercent, 0, 100)
  };
}

export function enabledEvidenceRules(config) {
  const rules = [
    ['dangerous_attacks', config.attackEvidenceDangerousAttacksEnabled, config.attackEvidenceDangerousAttacksMin],
    ['shots', config.attackEvidenceShotsEnabled, config.attackEvidenceShotsMin],
    ['shots_on_target', config.attackEvidenceShotsOnTargetEnabled, config.attackEvidenceShotsOnTargetMin],
    ['corners', config.attackEvidenceCornersEnabled, config.attackEvidenceCornersMin]
  ];
  return rules.filter(([, enabled]) => Boolean(enabled)).map(([key, , minimum]) => ({ key, minimum }));
}

export function validateCar31Config(input = {}) {
  const config = normalizeCar31Config(input);
  const errors = [];
  const warnings = [];
  const enabledEvidence = enabledEvidenceRules(config);

  if (config.attackEvidenceEnabled && enabledEvidence.length === 0) {
    errors.push('Attack Evidence เปิดอยู่ แต่ไม่มี Evidence sub-condition เปิดใช้งาน');
  }
  if (config.attackEvidenceEnabled && config.attackEvidenceRequirement !== 'ALL') {
    const required = Number(config.attackEvidenceRequirement);
    if (Number.isFinite(required) && required > enabledEvidence.length) {
      errors.push(`Evidence ต้องผ่าน ${required} เงื่อนไข แต่เปิดอยู่เพียง ${enabledEvidence.length} เงื่อนไข`);
    }
  }
  if (!CAR31_SOURCE_MODE.locked && config.sourcePrimary === config.sourceFallback && config.sourceFallback !== 'OFF') {
    warnings.push('Primary Source และ Fallback Source เป็นแหล่งเดียวกัน');
  }
  if (config.sourceRefreshSeconds < 20) {
    warnings.push('Refresh ต่ำกว่า 20 วินาทีเป็นโหมดทดลอง ต้องตรวจ source policy และ load ก่อนใช้งานจริง');
  }
  if (config.market === 'AH' && config.ahMax !== null && config.ahMax < config.ahMin) {
    errors.push('AH Line สูงสุดต้องไม่น้อยกว่าค่าขั้นต่ำ');
  }
  if (config.oddsMax !== null && config.oddsMax < config.oddsMin) {
    errors.push('Odds สูงสุดต้องไม่น้อยกว่าค่าขั้นต่ำ');
  }

  return { ok: errors.length === 0, errors, warnings, config };
}

export function configSummary(configInput = {}) {
  const config = normalizeCar31Config(configInput);
  const evidence = enabledEvidenceRules(config);
  const evidenceText = !config.attackEvidenceEnabled
    ? 'Evidence OFF'
    : `${config.attackEvidenceRequirement === 'ALL' ? 'ALL' : `≥${config.attackEvidenceRequirement}`} of ${evidence.length} evidence rules`;
  const marketText = config.market === 'OU'
    ? `${config.ouDirection} ${config.ouLine}`
    : config.market;
  return `${config.side} · ${config.minuteMin}-${config.minuteMax}' · ${marketText} · odds ≥${config.oddsMin.toFixed(2)} · Momentum ≥${config.momentumMin}% · ${evidenceText}`;
}
