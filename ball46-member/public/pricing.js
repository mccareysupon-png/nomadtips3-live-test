const button = document.querySelector('#subscribeButton');
const notice = document.querySelector('#checkoutNotice');
// Paid checkout stays closed until verified login and subscription entitlement are enabled.
if(button){
  button.disabled = true;
  button.textContent = 'Membership enrollment coming soon';
  button.setAttribute('aria-disabled','true');
}
if(notice){
  notice.hidden = false;
  notice.textContent = 'Member registration is temporarily closed while secure login and subscription verification are finalized. No payment is being collected here.';
}
