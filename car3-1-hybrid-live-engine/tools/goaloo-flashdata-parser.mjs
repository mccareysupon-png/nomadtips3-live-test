export const GOALOO_FLASH_DELIMS = Object.freeze({ domain: '$$', dataType: '!', record: '^', column: ',' });

// Names below intentionally follow Goaloo's public flashlive runEvent switch.
// Do not reinterpret shot_in/shot_out/shot_lost as a particular statistical bucket
// until the technical-stat mapping is independently verified.
export const GOALOO_ANIMATION_EVENT = Object.freeze({
  20: 'dangerous_attack',
  21: 'attack',
  22: 'control',
  23: 'ball_in',
  24: 'yellow_card',
  25: 'red_card',
  28: 'shot_in',
  29: 'shot_out',
  34: 'corner',
  41: 'shot_lost'
});

const clean = v => String(v ?? '').replace(/\r?\n/g, '').trim();
const num = v => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fields = value => clean(value).split(GOALOO_FLASH_DELIMS.record);
const records = value => fields(value).filter(Boolean);

export function parseGoalooFlashGraphEvent(row) {
  const c = clean(row).split(GOALOO_FLASH_DELIMS.column);
  if (c.length < 3) return null;
  const eventType = num(c[2]);
  return {
    id: num(c[0]),
    teamId: clean(c[1]),
    eventType,
    eventName: GOALOO_ANIMATION_EVENT[eventType] || `event_${eventType ?? 'unknown'}`,
    location: clean(c[3]),
    state: num(c[4]),
    time: num(c[5]),
    injuryTime: num(c[6]),
    eventId: clean(c[9]),
    playerNum: clean(c[10]),
    playerName: clean(c[11])
  };
}

export function parseGoalooFlashBarDetail(row) {
  const c = clean(row).split(GOALOO_FLASH_DELIMS.column);
  if (c.length < 3) return null;
  const eventType = num(c[3]);
  return {
    id: num(c[0]),
    dataType: num(c[1]),
    teamId: clean(c[2]),
    eventType,
    eventName: GOALOO_ANIMATION_EVENT[eventType] || `event_${eventType ?? 'unknown'}`,
    time: num(c[4]),
    injuryTime: num(c[5]) ?? 0
  };
}

export function parseGoalooFlashPoint(row) {
  const c = clean(row).split(GOALOO_FLASH_DELIMS.column);
  if (c.length < 5) return null;
  return {
    pointId: num(c[0]),
    teamId: clean(c[1]),
    x: num(c[2]),
    y: num(c[3]),
    eventId: clean(c[4]),
    playerNum: clean(c[5]),
    playerName: clean(c[6])
  };
}

export function parseGoalooFlashChangeSchedule(row) {
  // Empty ^ fields are significant in Goaloo's schedule schema; never filter them.
  const t = fields(row);
  if (!clean(t[0])) return null;
  return {
    matchId: clean(t[0]),
    homeScore: num(t[1]),
    awayScore: num(t[2]),
    state: num(t[3]),
    sourceTime: clean(t[4]),
    detailTime: clean(t[5]),
    homeTechA: clean(t[8]),
    awayTechA: clean(t[9]),
    homeTechB: clean(t[10]),
    awayTechB: clean(t[11]),
    homeYellow: num(t[12]),
    homeRed: num(t[13]),
    homeCorner: num(t[14]),
    awayYellow: num(t[15]),
    awayRed: num(t[16]),
    awayCorner: num(t[17])
  };
}

export function parseGoalooFlashFullSchedule(row) {
  // Empty ^ fields are significant in Goaloo's schedule schema; never filter them.
  const t = fields(row);
  if (!clean(t[0])) return null;
  return {
    matchId: clean(t[0]),
    weather: clean(t[1]),
    temperature: clean(t[2]),
    field: clean(t[3]),
    homeTeamId: clean(t[4]),
    awayTeamId: clean(t[5]),
    homeScore: num(t[6]),
    awayScore: num(t[7]),
    state: num(t[8]),
    sequence: num(t[9]),
    sourceTime: clean(t[10]),
    detailTime: clean(t[11]),
    homeDataA: clean(t[12]),
    awayDataA: clean(t[13]),
    weatherType: num(t[14]),
    homeHalfScore: num(t[15]),
    awayHalfScore: num(t[16]),
    homeFlag: clean(t[17]),
    awayFlag: clean(t[18]),
    hasOverTime: clean(t[19]),
    homeDataB: clean(t[20]),
    awayDataB: clean(t[21]),
    homeYellow: num(t[22]),
    homeRed: num(t[23]),
    homeCorner: num(t[24]),
    awayYellow: num(t[25]),
    awayRed: num(t[26]),
    awayCorner: num(t[27])
  };
}

export function parseGoalooFlashPayload(body, { mode = 'change' } = {}) {
  const domains = clean(body).split(GOALOO_FLASH_DELIMS.domain).filter(Boolean);
  return domains.map(domain => {
    const c = domain.split(GOALOO_FLASH_DELIMS.dataType);
    if (mode === 'full') {
      return {
        mode,
        schedule: parseGoalooFlashFullSchedule(c[0]),
        // Goaloo full-load code reads c[3] as the current GraphData row,
        // c[4] as status-bar history, and c[5] as point history.
        currentEvent: parseGoalooFlashGraphEvent(c[3]),
        statusEvents: records(c[4]).map(parseGoalooFlashBarDetail).filter(Boolean),
        points: records(c[5]).map(parseGoalooFlashPoint).filter(Boolean),
        sectionCount: c.length
      };
    }
    return {
      mode,
      schedule: parseGoalooFlashChangeSchedule(c[0]),
      events: records(c[1]).map(parseGoalooFlashGraphEvent).filter(Boolean),
      statusEvents: records(c[2]).map(parseGoalooFlashBarDetail).filter(Boolean),
      points: records(c[3]).map(parseGoalooFlashPoint).filter(Boolean),
      sectionCount: c.length
    };
  });
}
