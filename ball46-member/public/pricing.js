const button = document.querySelector('#subscribeButton');
const notice = document.querySelector('#checkoutNotice');

async function startCheckout(){
  button.disabled = true;
  button.textContent = 'Opening Stripe…';
  notice.hidden = true;
  try{
    const response = await fetch('/api/stripe/checkout',{method:'POST'});
    const data = await response.json();
    if(response.ok && data?.url){
      location.href = data.url;
      return;
    }
    notice.textContent = data?.error === 'STRIPE_NOT_CONFIGURED'
      ? 'Stripe is intentionally not configured in this isolated prototype yet.'
      : 'Stripe checkout is not available right now.';
    notice.hidden = false;
  }catch{
    notice.textContent = 'Unable to reach checkout.';
    notice.hidden = false;
  }finally{
    button.disabled = false;
    button.textContent = 'Subscribe with Stripe';
  }
}

button?.addEventListener('click',startCheckout);
