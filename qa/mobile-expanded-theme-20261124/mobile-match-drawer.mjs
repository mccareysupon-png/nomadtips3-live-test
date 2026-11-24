// Keep the drawer inset aligned with the real mobile header, including on resize.
export const mobileMatchDrawerScript = `(() => {
  const mobile = matchMedia('(max-width: 760px)');
  let header;
  let drawer;

  function alignDrawer() {
    if (!mobile.matches || !header?.isConnected || !drawer?.isConnected) return;
    const edge = header.getBoundingClientRect().bottom;
    drawer.style.setProperty('--b46-match-header-edge', Math.max(0, edge) + 'px');
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(alignDrawer) : null;
  document.addEventListener('click', event => {
    if (!mobile.matches || !event.target.closest?.('#b46gn-cards [data-b46gn-fixture]')) return;
    const currentHeader = document.querySelector('#b46m-teal-shell');
    drawer = document.querySelector('#b46gn-detail');
    if (!currentHeader || !drawer) return;
    if (currentHeader !== header) {
      observer?.disconnect();
      header = currentHeader;
      observer?.observe(header);
    }
    alignDrawer();
    drawer.querySelector('.b46gn-sheet').scrollTop = 0;
  }, true);
  window.addEventListener('resize', alignDrawer, { passive: true });
})();`;
