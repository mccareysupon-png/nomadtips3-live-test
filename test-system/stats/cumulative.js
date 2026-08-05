import { loadRecords } from '../shared.js?v=202608051120';
import { HISTORICAL_RECORDS } from '../history.js?v=202608051145';

export function recordTime(record) {
  const time = new Date(record.kickoffUtc ?? record.pickDate ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function loadCumulativeRecords() {
  const merged = new Map();
  HISTORICAL_RECORDS.forEach(record => merged.set(String(record.fixtureId), record));
  loadRecords().forEach(record => merged.set(String(record.fixtureId), record));
  return [...merged.values()].sort((a, b) => recordTime(a) - recordTime(b));
}

export function dateLabel(record) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: '2-digit'
    }).format(new Date(record.kickoffUtc ?? record.pickDate));
  } catch {
    return record.pickDate ?? '—';
  }
}

export function selectChartRange(records, range) {
  const limit = range === 'ALL' ? records.length : Math.max(1, Number(range) || 20);
  const start = Math.max(0, records.length - limit);
  return {
    before: records.slice(0, start),
    visible: records.slice(start)
  };
}

export function adaptiveChartWidth(host, count, range) {
  const viewportWidth = host?.parentElement?.clientWidth || 900;
  const spacing = range === '20' ? 30 : range === '50' ? 18 : range === '100' ? 12 : 9;
  return Math.max(viewportWidth, 82 + Math.max(1, count) * spacing);
}
