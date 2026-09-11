(() => {
  'use strict';

  const FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-stats-v3.json';
  const $ = s => document.querySelector(s);
  const pct = n => Number.isFinite(Number(n)) ? `${Number(n).toFixed(1)}%` : '—';
  const odds = n => Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—';
  const money = n => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return `${x > 0 ? '+' : ''}${Math.round(x)}`;
  };
  const cls = result => ['WIN','HALF_WIN'].includes(result) ? 'win' : ['LOSS','HALF_LOSS'].includes(result) ? 'loss' : 'pending';
  const resultText = result => String(result || '').replaceAll('_', ' ');

  function ensurePresentationStyle() {
    if (document.getElementById('prediction2-borderless-gradient-v1')) return;
    const style = document.createElement('style');
    style.id = 'prediction2-borderless-gradient-v1';
    style.textContent = `
      body[data-page="prediction2"] .king-scorebar{
        gap:0!important;
        border:0!important;
        background:linear-gradient(115deg,rgba(28,40,33,.98),rgba(20,29,24,.99) 48%,rgba(15,22,18,.995))!important;
        border-radius:12px!important;
        box-shadow:0 12px 30px rgba(0,0,0,.15)!important;
        overflow:hidden!important;
      }
      body[data-page="prediction2"] .king-scorebar .metric{
        background:transparent!important;
        border:0!important;
        border-right:1px solid rgba(255,255,255,.055)!important;
        box-shadow:none!important;
      }
      body[data-page="prediction2"] .king-scorebar .metric:last-child{border-right:0!important;}

      body[data-page="prediction2"] .king-panel{
        border:0!important;
        background:linear-gradient(160deg,rgba(24,33,28,.985),rgba(18,25,21,.992) 55%,rgba(14,20,17,.997))!important;
        border-radius:12px!important;
        box-shadow:0 12px 30px rgba(0,0,0,.13)!important;
        overflow:hidden!important;
      }
      body[data-page="prediction2"] .king-panel-head{
        border-bottom:1px solid rgba(255,255,255,.06)!important;
        background:linear-gradient(90deg,rgba(255,255,255,.018),transparent 72%)!important;
      }
      body[data-page="prediction2"] .king-table th,
      body[data-page="prediction2"] .king-table td{
        border-bottom:1px solid rgba(255,255,255,.055)!important;
      }
      body[data-page="prediction2"] .king-table th{
        background:rgba(255,255,255,.018)!important;
      }
      body[data-page="prediction2"] .king-table tbody tr:last-child td{border-bottom:0!important;}
      body[data-page="prediction2"] .king-table tbody tr:not(.king-expand-row){transition:background-color .16s ease;}
      body[data-page="prediction2"] .king-table tbody tr:not(.king-expand-row):hover{background:rgba(80,220,143,.025)!important;}

      body[data-page="prediction2"] .king-rules{
        gap:0!important;
        background:transparent!important;
      }
      body[data-page="prediction2"] .king-rules div{
        background:transparent!important;
        border:0!important;
        border-right:1px solid rgba(255,255,255,.055)!important;
        border-bottom:1px solid rgba(255,255,255,.055)!important;
      }
      body[data-page="prediction2"] .king-rules div:nth-child(3n){border-right:0!important;}
      body[data-page="prediction2"] .king-rules div:nth-last-child(-n+3){border-bottom:0!important;}
      body[data-page="prediction2"] .king-note{border-top:1px solid rgba(255,255,255,.055)!important;}

      body[data-page="prediction2"] .king-analysis-drawer{
        border:0!important;
        background:linear-gradient(160deg,rgba(23,32,27,.99),rgba(14,20,17,.997))!important;
        box-shadow:0 12px 30px rgba(0,0,0,.13)!important;
      }
      body[data-page="prediction2"] .king-analysis-drawer.is-open{border:0!important;}
      body[data-page="prediction2"] .king-analysis-grid{
        gap:0!important;
        background:linear-gradient(140deg,rgba(255,255,255,.018),rgba(80,220,143,.012))!important;
      }
      body[data-page="prediction2"] .king-analysis-block{
        background:transparent!important;
        border:0!important;
        border-right:1px solid rgba(255,255,255,.055)!important;
      }
      body[data-page="prediction2"] .king-analysis-block:last-child{border-right:0!important;}

      body[data-page="prediction2"] .king-expand-row td{
        background:linear-gradient(160deg,rgba(21,30,25,.995),rgba(13,19,16,.998))!important;
        border-bottom:1px solid rgba(255,255,255,.045)!important;
      }
      body[data-page="prediction2"] .king-expand-shell{
        background:linear-gradient(145deg,rgba(27,38,31,.66),rgba(15,22,18,.22))!important;
        border-top:1px solid rgba(80,220,143,.14)!important;
        border-bottom:0!important;
        box-shadow:none!important;
      }
      body[data-page="prediction2"] .king-expand-summary{
        gap:0!important;
        background:linear-gradient(135deg,rgba(255,255,255,.022),rgba(80,220,143,.012))!important;
        border:0!important;
        box-shadow:none!important;
      }
      body[data-page="prediction2"] .king-expand-summary>div{
        background:transparent!important;
        border:0!important;
        border-right:1px solid rgba(255,255,255,.055)!important;
      }
      body[data-page="prediction2"] .king-expand-summary>div:last-child{border-right:0!important;}
      body[data-page="prediction2"] .king-expand-lower{
        gap:0!important;
        background:linear-gradient(135deg,rgba(255,255,255,.018),rgba(80,220,143,.01))!important;
        border-radius:8px!important;
        overflow:hidden!important;
      }
      body[data-page="prediction2"] .king-expand-block{
        background:transparent!important;
        border:0!important;
        border-radius:0!important;
        box-shadow:none!important;
      }
      body[data-page="prediction2"] .king-expand-block + .king-expand-block{
        border-left:1px solid rgba(255,255,255,.055)!important;
      }
      body[data-page="prediction2"] .king-expand-section,
      body[data-page="prediction2"] .king-expand-status{
        border-top:1px solid rgba(255,255,255,.055)!important;
      }

      body[data-page="prediction2"] .king-tabs{
        border-bottom:1px solid rgba(255,255,255,.055)!important;
      }

      body[data-page="prediction2"] .king-preview-card,
      body[data-page="prediction2"] .king-preview-card::after,
      body[data-page="prediction2"] .king-scorebar,
      body[data-page="prediction2"] .king-panel,
      body[data-page="prediction2"] .king-analysis-drawer,
      body[data-page="prediction2"] .king-analysis-grid,
      body[data-page="prediction2"] .king-expand-summary,
      body[data-page="prediction2"] .king-expand-lower,
      body[data-page="prediction2"] .king-expand-block{
        border-radius:0!important;
      }

      @media(max-width:699px){
        body[data-page="prediction2"] .king-scorebar .metric:nth-child(4n){border-right:0!important;}
        body[data-page="prediction2"] .king-scorebar .metric:nth-child(-n+4){border-bottom:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-rules div{border-right:1px solid rgba(255,255,255,.055)!important;border-bottom:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-rules div:nth-child(3n){border-right:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-rules div:nth-child(even){border-right:0!important;}
        body[data-page="prediction2"] .king-rules div:nth-last-child(-n+2){border-bottom:0!important;}
        body[data-page="prediction2"] .king-analysis-block{border-right:0!important;border-bottom:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-analysis-block:last-child{border-bottom:0!important;}
        body[data-page="prediction2"] .king-expand-summary>div{border-right:1px solid rgba(255,255,255,.055)!important;border-bottom:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-expand-summary>div:nth-child(even){border-right:0!important;}
        body[data-page="prediction2"] .king-expand-summary>div:nth-last-child(-n+2){border-bottom:0!important;}
        body[data-page="prediction2"] .king-expand-block + .king-expand-block{border-left:0!important;border-top:1px solid rgba(255,255,255,.055)!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function resultOrder(a, b) {
    const aa = `${a.date || ''} ${a.kickoff || ''} ${a.settled_at || ''}`;
    const bb = `${b.date || ''} ${b.kickoff || ''} ${b.settled_at || ''}`;
    return bb.localeCompare(aa);
  }

  function render(data) {
    if (!data || data.record_version !== 'KING_STATS_V3') return;
    const records = Array.isArray(data.records) ? data.records : [];
    const finalResults = ['WIN', 'HALF_WIN', 'LOSS', 'HALF_LOSS', 'PUSH'];
    const historyResults = [...finalResults, 'VOID'];
    const settled = records.filter(x => finalResults.includes(String(x.result || '').toUpperCase()));
    const history = records.filter(x => historyResults.includes(String(x.result || '').toUpperCase()));
    const voids = history.filter(x => String(x.result || '').toUpperCase() === 'VOID');
    const s = data.summary || {};

    const firstLabel = $('.king-scorebar .metric:first-child span');
    const pushLabel = $('.king-scorebar .metric.draw span');
    if (firstLabel) firstLabel.textContent = 'SETTLED';
    if (pushLabel) pushLabel.textContent = 'PUSH';

    if ($('#sumPicks')) $('#sumPicks').textContent = String(Number(s.settled || 0));
    if ($('#sumWin')) $('#sumWin').textContent = String(Number(s.wins || 0));
    if ($('#sumLoss')) $('#sumLoss').textContent = String(Number(s.losses || 0));
    if ($('#sumDraw')) $('#sumDraw').textContent = String(Number(s.pushes || 0));
    if ($('#sumRate')) $('#sumRate').textContent = s.win_rate == null ? '—' : pct(s.win_rate);
    if ($('#sumOdds')) $('#sumOdds').textContent = s.avg_odds == null ? '—' : odds(s.avg_odds);
    if ($('#sumNet')) $('#sumNet').textContent = money(s.net || 0);
    if ($('#sumRoi')) $('#sumRoi').textContent = s.roi == null ? '—' : pct(s.roi);

    const historyLabel = voids.length ? `${settled.length} settled · ${voids.length} void` : `${settled.length} settled`;
    const historyCount = $('#historyCount');
    if (historyCount) historyCount.textContent = historyLabel;
    const historyTab = $('.king-tabs button[data-tab="history"]');
    if (historyTab) historyTab.textContent = `HISTORY · ${history.length}`;

    const historyRows = $('#historyRows');
    if (historyRows) {
      historyRows.innerHTML = history.slice().sort(resultOrder).map(x => {
        const result = String(x.result || '').toUpperCase();
        const pl = Number(x.profit || 0);
        const title = result === 'VOID' ? ' title="Invalidated: AH sign was reversed by v1 engine"' : '';
        return `<tr${title}><td>${x.date || '—'}</td><td>${x.pick || '—'}</td><td>${odds(x.odds)}</td><td>${x.ft || '—'}</td><td><span class="king-result ${cls(result)}">${resultText(result)}</span></td><td class="king-pl ${pl >= 0 ? 'positive' : 'negative'}">${money(pl)}</td></tr>`;
      }).join('');
    }

    const byDay = new Map();
    settled.forEach(x => {
      const date = x.date || '—';
      const result = String(x.result || '').toUpperCase();
      const d = byDay.get(date) || {p: 0, w: 0, l: 0, push: 0, net: 0};
      d.p += 1;
      d.w += ['WIN','HALF_WIN'].includes(result) ? 1 : 0;
      d.l += ['LOSS','HALF_LOSS'].includes(result) ? 1 : 0;
      d.push += result === 'PUSH' ? 1 : 0;
      d.net += Number(x.profit || 0);
      byDay.set(date, d);
    });
    const dailyRows = $('#dailyRows');
    if (dailyRows) {
      dailyRows.innerHTML = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, d]) => {
        const decided = d.w + d.l;
        const rate = decided ? d.w / decided * 100 : null;
        return `<tr><td>${date}</td><td>${d.p}</td><td class="king-result win">${d.w}</td><td class="king-result loss">${d.l}</td><td>${rate == null ? '—' : pct(rate)}</td><td class="king-pl ${d.net >= 0 ? 'positive' : 'negative'}">${money(d.net)}</td></tr>`;
      }).join('');
    }

    const hero = $('.king-hero p');
    if (hero) hero.textContent = 'ADD K pre-match selection · combined verified statistics since 04/09/2026 · invalid AH v1 excluded as VOID';
  }

  async function load() {
    try {
      const r = await fetch(`${FEED}?t=${Date.now()}`, {cache: 'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      render(await r.json());
    } catch (e) {
      console.warn('KING Statistics V3 unavailable', e);
    }
  }

  ensurePresentationStyle();
  window.NOMAD_KING_STATS_V3_ACTIVE = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once: true});
  else load();
  setTimeout(load, 2500);
  setInterval(load, 60000);
})();