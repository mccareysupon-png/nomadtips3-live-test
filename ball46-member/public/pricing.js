const button = document.querySelector('#subscribeButton');
const notice = document.querySelector('#checkoutNotice');

const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/fZu4gz0z03Ydeu8cnR8AE04';

function startCheckout(){
  notice.hidden = true;
  button.disabled = true;
  button.textContent = 'Opening secure checkout…';
  try{
    window.location.assign(STRIPE_PAYMENT_LINK);
  }catch{
    notice.textContent = 'Unable to open Stripe Checkout. Please try again.';
    notice.hidden = false;
    button.disabled = false;
    button.textContent = 'Subscribe · $5/month';
  }
}

button?.addEventListener('click',startCheckout);
