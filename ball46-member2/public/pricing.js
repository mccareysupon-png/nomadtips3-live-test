const button=document.querySelector('#subscribeButton');
const notice=document.querySelector('#checkoutNotice');
const params=new URLSearchParams(window.location.search);
// Display enrollment state BEFORE the paid plan, where users cannot miss it.
const flowNotice=document.querySelector('#membershipFlowNotice');
const flowLabel=document.querySelector('#membershipFlowLabel');
const flowTitle=document.querySelector('#membershipFlowTitle');
const flowMessage=document.querySelector('#membershipFlowMessage');
if(params.get('membership')==='required'){
  if(flowNotice)flowNotice.hidden=false;
  if(flowLabel)flowLabel.textContent='SUBSCRIPTION REQUIRED';
  if(flowTitle)flowTitle.textContent='Email verified — membership payment required';
  if(flowMessage)flowMessage.textContent='Your email sign-in succeeded, but no active Ball46 Member subscription was found for this account. Choose Subscribe · $5/month below to complete Stripe payment. If you already paid, do not pay a second time.';
}else if(params.has('canceled')){
  if(flowNotice)flowNotice.hidden=false;
  if(flowLabel)flowLabel.textContent='PAYMENT NOT COMPLETED';
  if(flowTitle)flowTitle.textContent='Checkout was canceled';
  if(flowMessage)flowMessage.textContent='Your email code may have worked, but no new membership was activated by the canceled checkout. Choose Subscribe to return to payment, or use Member Login if you already have an active subscription.';
}
function showNotice(message){
  if(notice){notice.hidden=false;notice.textContent=message;}
}
if(button){
  button.disabled=true;
  button.textContent='Preparing secure membership checkout…';
}
(async()=>{
  try{
    const response=await fetch('/api/enrollment-status',{cache:'no-store'});
    const state=await response.json();
    if(!response.ok||!state?.ok)throw new Error('Enrollment status unavailable');
    if(!state.enrollmentAvailable){
      if(button){button.disabled=true;button.textContent='Membership enrollment coming soon';}
      showNotice('Payments are temporarily closed while secure member activation is verified. No payment is being collected here.');
      return;
    }
    if(button){
      button.disabled=false;
      button.textContent='Subscribe · $5/month';
      button.addEventListener('click',()=>{
        button.disabled=true;
        button.textContent='Opening secure member sign-in…';
        window.location.assign('/api/member/checkout');
      });
    }
    if(params.has('canceled'))showNotice('Checkout was canceled. No new subscription has been activated.');
  }catch{
    if(button){button.disabled=true;button.textContent='Membership enrollment temporarily unavailable';}
    showNotice('Checkout is unavailable at this moment. No payment has been processed.');
  }
})();
