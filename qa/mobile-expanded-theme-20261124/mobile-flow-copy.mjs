export const FLOW_ASSET = '/b46-mobile-event-flow-bars-20261102.js';

const labels = new Map([
  ['จุดบนแกนเวลา ไม่ใช่ค่าความกดดันของทีม', 'Marker shows when the signal was recorded.'],
  ['ดูรายละเอียด', 'Show details'],
  [' · ดูรายละเอียด', ' · Show details'],
  ['ปิดรายละเอียด', 'Hide details'],
  ['ยังไม่มีข้อมูลกราฟ', 'No Event Flow data yet'],
  ['เก็บ Signal ไว้ครบ แต่ไม่มีตำแหน่งในช่วงกราฟนี้', 'Signal recorded outside the displayed range'],
  ['แตะแท่งเพื่อดูค่า · แตะการ์ด Signal เพื่อดูรายละเอียด', 'Tap a bar for its value or a signal for details'],
  ['ไม่มีข้อมูลในนาทีนี้', 'No data for this minute'],
  ['ไม่มีค่าความกดดันในนาทีนี้ แสดงเฉพาะเวลา Signal', 'Only the signal time is available for this minute'],
  [' ไม่ระบุตำแหน่ง', ' without a time marker'],
  ['ไม่ระบุนาที', 'Minute unavailable'],
]);

export function englishFlowCopy(script) {
  for (const [from, to] of labels) {
    // The labels include a shorter phrase that also appears in the chart hint.
    // Replace complete string literals so the hint and button remain distinct.
    script = script.replaceAll("'" + from + "'", "'" + to + "'")
      .replaceAll('"' + from + '"', '"' + to + '"')
      .replaceAll('>' + from + '<', '>' + to + '<');
  }
  return script;
}
