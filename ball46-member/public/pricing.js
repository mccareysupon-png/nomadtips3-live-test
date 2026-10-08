const button = document.querySelector('#subscribeButton');
const notice = document.querySelector('#checkoutNotice');

const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/fZu4gz0z03Ydeu8cnR8AE04';
const CHECKOUT_LIVE = false;

function startCheckout(){
  notice.hidden = true;
  if(!CHECKOUT_LIVE){
    notice.textContent = 'Ball46 Member is $5/month. Stripe checkout is prepared, but public signup remains paused until automatic member access verification is enabled.';
    notice.hidden = false;
    return;
  }
  location.href = STRIPE_PAYMENT_LINK;
}

button?.addEventListener('click',startCheckout);
