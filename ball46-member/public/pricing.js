const button=document.querySelector('#subscribeButton');
const notice=document.querySelector('#checkoutNotice');
const params=new URLSearchParams(window.location.search);
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
    if(!state.ownerPilotAvailable){
      if(button){button.disabled=true;button.textContent='Membership enrollment coming soon';}
      showNotice('Payments are temporarily closed while secure member activation is verified. No payment is being collected here.');
      return;
    }
    if(button){
      button.disabled=false;
      button.textContent='Continue to secure checkout · $5/month';
      button.addEventListener('click',()=>{
        button.disabled=true;
        button.textContent='Opening secure member sign-in…';
        window.location.assign('/api/member/checkout');
      });
    }
    if(params.has('membership'))showNotice('Login succeeded, but no active Ball46 Member subscription was found. Continue below to subscribe using the same verified email.');
    else if(params.has('canceled'))showNotice('Checkout was canceled. No new subscription has been activated.');
  }catch{
    if(button){button.disabled=true;button.textContent='Membership enrollment temporarily unavailable';}
    showNotice('Checkout is unavailable at this moment. No payment has been processed.');
  }
})();
