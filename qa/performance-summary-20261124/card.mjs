// Keep the established card markup, classes and CSS hooks.
const markup = `
<div class="b46-perf-grid">
  <section class="b46-perf-side today">
  <div class="b46-perf-head"><div class="b46-perf-title"><span class="b46-perf-kicker">TODAY'S PERFORMANCE</span><span class="b46-perf-sub" data-b46-label="today">Live Summary</span></div><div class="b46-perf-rate"><span>WIN RATE</span><strong data-b46-rate="today">—</strong></div></div>
  <div class="b46-perf-stats"><div class="b46-perf-stat win"><span>WIN</span><strong data-b46-stat="today-win">—</strong></div><div class="b46-perf-stat loss"><span>LOSS</span><strong data-b46-stat="today-loss">—</strong></div><div class="b46-perf-stat push"><span>PUSH</span><strong data-b46-stat="today-push">—</strong></div><div class="b46-perf-stat pending"><span>PENDING</span><strong data-b46-stat="today-pending">—</strong></div><div class="b46-perf-stat avg-odds"><span>AVG ODDS</span><strong data-b46-avg-odds="today">—</strong></div></div>
  <div class="b46-perf-foot"><span class="b46-perf-total">TOTAL PICKS <b data-b46-total="today">—</b></span><div class="b46-market-row" data-b46-markets="today"></div></div>
  <span class="b46-perf-state">LONDON DAY · 06:00</span>
  </section>
  <section class="b46-perf-side yesterday">
  <div class="b46-perf-head"><div class="b46-perf-title"><span class="b46-perf-kicker">YESTERDAY'S PERFORMANCE</span><span class="b46-perf-sub" data-b46-label="yesterday">Final Summary</span></div><div class="b46-perf-rate"><span>WIN RATE</span><strong data-b46-rate="yesterday">—</strong></div></div>
  <div class="b46-perf-stats"><div class="b46-perf-stat win"><span>WIN</span><strong data-b46-stat="yesterday-win">—</strong></div><div class="b46-perf-stat loss"><span>LOSS</span><strong data-b46-stat="yesterday-loss">—</strong></div><div class="b46-perf-stat push"><span>PUSH</span><strong data-b46-stat="yesterday-push">—</strong></div><div class="b46-perf-stat avg-odds"><span>AVG ODDS</span><strong data-b46-avg-odds="yesterday">—</strong></div></div>
  <div class="b46-perf-foot"><span class="b46-perf-total">TOTAL PICKS <b data-b46-total="yesterday">—</b></span><div class="b46-market-row" data-b46-markets="yesterday"></div></div>
  <span class="b46-perf-state">FINAL · SETTLED ONLY</span>
  </section></div>`;

export function cardHTML(view) {
  const body = markup.replace(/(data-b46-(label|rate|stat|avg-odds|total)="([^"]+)")[^<>]*>([^<]*)</g,
    (_token, attr, kind, key) => {
      const tone = kind === 'rate' ? ' data-b46-rate-tone="' + view.tones[key] + '"' : '';
      return attr + tone + '>' + view.fields[kind + ':' + key] + '<';
    });
  const stamp = view.verifiedAt ? ' data-b46-performance-updated-at="' + view.verifiedAt + '"' : '';
  return '<section id="ball46-daily-performance" aria-label="Daily performance" data-b46-performance-state="' +
    view.state + '"' + stamp + '>' + body + '</section>';
}

export function bootData(view) {
  return '<script type="application/json" id="b46-performance-summary-data">' +
    JSON.stringify(view).replace(/</g, '\\u003c') + '</script>';
}
