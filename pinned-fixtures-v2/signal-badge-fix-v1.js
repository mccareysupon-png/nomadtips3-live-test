/* B46_PIN_V2_SIGNAL_BADGE_FIX_TEST_20261111
   Test-set only. Restores the existing Signal count badge when a match row is
   moved into the Favorite/Pinned block. Uses existing DOM metadata only.
   No API calls. No card clone. No signal-data mutation. */
function b46PinSignalBadge(row){
  const host=row?.querySelector?.('.signal-inline-stack[data-inline-signal-count]');
  if(!host)return;

  const n=Number(host.getAttribute('data-inline-signal-count'));
  let badge=host.querySelector(':scope > .b46-league-market-signal-count');

  if(!Number.isInteger(n)||n<=0){
    badge?.remove();
    return;
  }

  if(!badge){
    badge=document.createElement('span');
    badge.className='b46-league-market-signal-count';
    badge.innerHTML='<i aria-hidden="true"></i><b></b><span></span>';
    host.append(badge);
  }

  const number=String(n);
  const label=n===1?'Signal':'Signals';
  if(badge.children[1].textContent!==number)badge.children[1].textContent=number;
  if(badge.children[2].textContent!==label)badge.children[2].textContent=label;
  badge.setAttribute('aria-label',number+' active '+label.toLowerCase());
}
