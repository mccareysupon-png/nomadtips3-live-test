export const dashboardPath = '/dashboard-v2-stage3-featured-facts-20261013a.js';
export const marker = 'id="codex-pc-default-dark"';
const cacheVersion = 'codex_pc_default_dark=1';

const oldStartup = "<script>(()=>{try{const t=localStorage.getItem('nomad343_dashboard_theme_v1')||'light';document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(_){}})();</script>";
const newStartup = `<script ${marker}> (() => {
  let theme = 'dark';
  try {
    if (localStorage.getItem('nomad343_dashboard_theme_v1') === 'light') theme = 'light';
  } catch {}
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#050807' : '#f4f8f5';
})();</script>`;
const oldPromo = `function selectedTheme(){
 try{return localStorage.getItem(THEME_KEY)==='dark'?'dark':'light';}
 catch{return document.documentElement.dataset.theme==='dark'?'dark':'light';}
}`;

function replaceOnce(source, before, after) {
  const index = source.indexOf(before);
  if (index < 0 || source.indexOf(before, index + before.length) >= 0) {
    throw new Error('Expected one theme source match: ' + before.slice(0, 100));
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

export function patchHtml(source) {
  if (!source.includes('nomad343_dashboard_theme_v1')) return source;
  const sourceAttribute = source.match(/\bsrc="[^"]*dashboard-v2-stage3-featured-facts-20261013a\.js(?:\?[^"]*)?"/)?.[0];
  if (!sourceAttribute) throw new Error('Missing dashboard script source');
  const separator = sourceAttribute.includes('?') ? '&' : '?';
  const versionedAttribute = sourceAttribute.slice(0, -1) + separator + cacheVersion + '"';
  let html = replaceOnce(source, '<html lang="en" data-theme="light">', '<html lang="en" data-theme="dark">');
  html = replaceOnce(html, '<meta name="theme-color" content="#eef2f1">', '<meta name="theme-color" content="#050807">');
  html = replaceOnce(html, oldStartup, newStartup);
  html = replaceOnce(html, "root.dataset.theme=e.newValue==='dark'?'dark':'light'",
    "root.dataset.theme=e.newValue==='light'?'light':'dark'");
  html = replaceOnce(html, oldPromo, `function selectedTheme(){
 return document.documentElement.dataset.theme==='light'?'light':'dark';
}`);
  return replaceOnce(html, sourceAttribute, versionedAttribute);
}

export function patchDashboard(source) {
  let js = replaceOnce(source, 'function setTheme(theme){', 'function setTheme(theme,persist=true){');
  js = replaceOnce(js, 'try{localStorage.setItem(THEME_KEY,next)}catch{}',
    'if(persist){try{localStorage.setItem(THEME_KEY,next)}catch{}}');
  return replaceOnce(js, "setTheme(stored==='dark'?'dark':'light')",
    "setTheme(stored==='light'?'light':'dark',false)");
}
