import assert from 'node:assert/strict';

export const desktopStyleId = 'b46-desktop-featured-details-20261124';

export async function checkDesktopFeatured(page, theme) {
  const featured = page.locator('.live-stage-grid > .right-rail > .featured-card[data-featured]');
  const stats = featured.locator(':scope > .feature-stats');
  const events = featured.locator(':scope > .feature-events');
  await stats.locator(':scope > .stat-row').first().waitFor({ state: 'visible', timeout: 25_000 });
  await events.locator(':scope > .event-item span[data-v11-event]').first().waitFor({ state: 'visible', timeout: 15_000 });

  const measured = await featured.evaluate((card, id) => {
    const style = document.getElementById(id).sheet;
    const comparison = card.querySelector('.feature-stats');
    const recent = card.querySelector('.feature-events');
    const rows = [...comparison.querySelectorAll('.stat-row')];
    const entries = [...recent.querySelectorAll('.event-item')];
    const trackWidths = rows.map(row => [...row.querySelectorAll('.stat-track')]
      .map(track => track.getBoundingClientRect().width));
    const data = () => ({
      values: rows.map(row => row.textContent),
      fills: rows.map(row => [...row.querySelectorAll('.stat-track > i')].map(bar => bar.style.width)),
      events: entries.map(row => row.textContent),
    });
    const before = data();
    style.disabled = true;
    let originalHeight;
    try {
      originalHeight = comparison.clientHeight;
    } finally {
      style.disabled = false;
    }
    const contrast = (foreground, background) => {
      const luminance = color => color.match(/\d+/g).slice(0, 3).map(Number).reduce((total, value, i) => {
        const c = value / 255;
        return total + [.2126, .7152, .0722][i] * (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
      }, 0);
      const [dark, light] = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
      return (light + .05) / (dark + .05);
    };
    const textRatios = rows.flatMap(row => [...row.querySelectorAll('b, span')].map(value =>
      contrast(getComputedStyle(value).color, getComputedStyle(row).backgroundColor)));
    for (const entry of entries) {
      const label = entry.querySelector('span');
      const background = getComputedStyle(entry).backgroundColor;
      textRatios.push(contrast(getComputedStyle(entry.querySelector('time')).color, background));
      for (const pseudo of ['::before', '::after']) {
        textRatios.push(contrast(getComputedStyle(label, pseudo).color, background));
      }
    }
    return {
      theme: document.documentElement.dataset.theme,
      column: card.parentElement.clientWidth,
      before, after: data(), trackWidths,
      comparisonHeight: comparison.clientHeight, originalHeight,
      inset: [rows[0], entries[0]].map(row => {
        const css = getComputedStyle(row);
        return { background: css.backgroundColor, shadow: css.boxShadow, border: css.borderTopWidth };
      }),
      minContrast: Math.min(...textRatios),
      fits: [comparison, recent, ...rows, ...entries].every(node => node.scrollWidth <= node.clientWidth + 1),
    };
  }, desktopStyleId);
  assert.equal(measured.theme, theme);
  assert.deepEqual(measured.before, measured.after);
  assert(measured.trackWidths.every(([left, right]) => left > 0 && Math.abs(left - right) < 1));
  assert(measured.inset.every(row => row.shadow.includes('inset') && row.border === '0px'));
  assert(measured.fits, 'The desktop sidebar overflowed');
  assert(measured.minContrast >= 4.5, theme + ' desktop sidebar contrast ' + measured.minContrast);
  return {
    theme, column: measured.column, comparisonRows: measured.after.values.length, recentEvents: measured.after.events.length,
    comparisonHeight: measured.comparisonHeight, originalHeight: measured.originalHeight,
    minContrast: Number(measured.minContrast.toFixed(2)), inset: true,
  };
}
