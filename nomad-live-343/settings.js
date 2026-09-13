(()=>{
'use strict';
const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.defer=true;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
(async()=>{try{await load('settings-special341.js?v=20260913-special341-v1');await load('settings-core.js?v=20260911-343-over-gap-v1')}catch(error){console.error('settings bootstrap failed',error)}})();
})();
