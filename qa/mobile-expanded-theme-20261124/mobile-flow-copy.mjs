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

const innerCardStyle = `@media (max-width: 760px) {
  #details {
    background: var(--panel);
    border: 0;
    border-radius: var(--b46-detail-radius, 13px);
    box-shadow: var(--b46-detail-shadow, none);
  }
  #details .detail-row {
    background: var(--callout);
    border: 0;
    border-radius: 9px;
    padding: 10px;
  }
  #details .detail-row + .detail-row { margin-top: 6px; }
  #details .details-head { padding-bottom: 8px; }
}`;

export function prepareMobileFlowAsset(script) {
  for (const [from, to] of labels) {
    // The labels include a shorter phrase that also appears in the chart hint.
    // Replace complete string literals so the hint and button remain distinct.
    script = script.replaceAll("'" + from + "'", "'" + to + "'")
      .replaceAll('"' + from + '"', '"' + to + '"')
      .replaceAll('>' + from + '<', '>' + to + '<');
  }
  return script
    .replaceAll('class="empty-chart" x=', 'class="empty-chart" text-anchor="middle" fill="var(--muted)" font-size="10" x=')
    .replace("CSS_TEXT+'</style>'+TEMPLATE", 'CSS_TEXT+' + JSON.stringify(innerCardStyle) + "+'</style>'+TEMPLATE");
}
