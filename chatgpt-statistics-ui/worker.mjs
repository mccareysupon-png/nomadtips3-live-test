// B46-STAT-UI-01 — Isolated static layout preview only. No Production API or data.
import html from './preview.html';
const headers = {
  'content-type':'text/html; charset=UTF-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'x-robots-tag':'noindex, nofollow',
  'referrer-policy':'no-referrer'
};
export default {
  fetch(request) {
    const u = new URL(request.url);
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method Not Allowed',{status:405});
    if (u.pathname !== '/' && u.pathname !== '/index.html') return new Response('Not Found',{status:404});
    return new Response(request.method === 'HEAD' ? null : html,{status:200,headers});
  }
};
