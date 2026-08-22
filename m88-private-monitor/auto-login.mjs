import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.join(__dirname, 'data', 'chrome-profile');
const HOME = 'https://www.m88.com/';
const SPORTS = 'https://www.m88.com/sports/M%20Sports%20Seamless';

function readCredential() {
  const ps = spawnSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'local-login.ps1'),'read'], { encoding:'utf8' });
  if (ps.status !== 0) throw new Error('Local M88 credential is not configured.');
  const encoded = String(ps.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
  const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  if (!parsed.username || !parsed.password) throw new Error('Local M88 credential is incomplete.');
  return parsed;
}

async function visible(locator) {
  try { return await locator.count() > 0 && await locator.first().isVisible(); } catch { return false; }
}

async function login(page, credential) {
  await page.goto(HOME, { waitUntil:'domcontentloaded', timeout:60000 }).catch(()=>{});
  await page.waitForTimeout(2500);

  const password = page.locator('input[type="password"]').first();
  if (!(await visible(password))) {
    console.log('M88 session appears active; skipping credential entry.');
    return true;
  }

  const usernameCandidates = [
    'input[autocomplete="username"]',
    'input[name*="user" i]',
    'input[id*="user" i]',
    'input[placeholder*="user" i]',
    'input[type="text"]'
  ];
  let username = null;
  for (const selector of usernameCandidates) {
    const candidate = page.locator(selector).first();
    if (await visible(candidate)) { username = candidate; break; }
  }
  if (!username) throw new Error('M88 username field was not found.');

  await username.fill(credential.username);
  await password.fill(credential.password);

  const buttons = [
    page.getByRole('button', { name:/login|log in|sign in|เข้าสู่ระบบ|đăng nhập/i }).first(),
    page.locator('button[type="submit"]').first(),
    page.locator('input[type="submit"]').first()
  ];
  let clicked = false;
  for (const button of buttons) {
    if (await visible(button)) { await button.click(); clicked = true; break; }
  }
  if (!clicked) throw new Error('M88 login button was not found.');

  console.log('Login submitted. If M88 shows CAPTCHA, OTP or verification, complete it in Chrome.');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    if (!(await visible(page.locator('input[type="password"]').first()))) return true;
  }
  throw new Error('M88 login did not complete within the verification window.');
}

const credential = readCredential();
let context;
try {
  try {
    context = await chromium.launchPersistentContext(PROFILE, { channel:'chrome', headless:false, viewport:null, args:['--start-maximized'] });
  } catch {
    context = await chromium.launchPersistentContext(PROFILE, { headless:false, viewport:null, args:['--start-maximized'] });
  }
  const page = context.pages()[0] || await context.newPage();
  const ok = await login(page, credential);
  if (ok) {
    console.log('M88 login/session ready. Opening Sports once to refresh the authenticated session...');
    await page.goto(SPORTS, { waitUntil:'domcontentloaded', timeout:60000 }).catch(()=>{});
    await page.waitForTimeout(5000);
  }
} finally {
  if (context) await context.close();
}
