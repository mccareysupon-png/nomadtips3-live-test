import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export const SITE = 'ball46-production';
export const SIDECAR = 'ball46-performance-summary';
export const TEST = 'ball46-performance-summary-test-20261124';
export const DOMAIN = 'https://ball46.com';
export const DIRECT = 'https://ball46-production.mccarey-supon.workers.dev';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item);

export async function cloudflare(path, method = 'GET', body) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  assert(token && account, 'Cloudflare credentials missing');
  if (method !== 'GET') {
    assert(method === 'POST' && [
      '/scripts/' + SITE + '/versions?bindings_inherit=strict',
      '/scripts/' + SITE + '/deployments',
    ].includes(path), 'Cloudflare write scope');
  }
  const form = body instanceof FormData;
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + account + '/workers' + path, {
    method, headers: {authorization: 'Bearer ' + token, ...(body && !form ? {'content-type':'application/json'} : {})},
    body: body === undefined || form ? body : JSON.stringify(body), signal: AbortSignal.timeout(90000),
  });
  const payload = await response.json();
  assert(response.ok && payload.success, method + ' ' + path + ' HTTP ' + response.status + ' ' +
    JSON.stringify((payload.errors ?? []).map(e => ({code:e.code,message:e.message}))));
  return payload.result;
}

export async function active(script = SITE) {
  const { deployments } = await cloudflare('/scripts/' + script + '/deployments?per_page=1');
  const deployment = deployments[0];
  assert(deployment?.versions?.length === 1 && Number(deployment.versions[0].percentage) === 100,
    'Expected one active version for ' + script);
  return { deployment: deployment.id, version: deployment.versions[0].version_id };
}

export async function version(script, id) {
  return cloudflare('/workers/' + script + '/versions/' + id + '?include=modules');
}

export async function get(url, options = {}) {
  const response = await fetch(url, {
    ...options, signal: AbortSignal.timeout(35000),
  });
  assert(response.ok, 'HTTP ' + response.status + ' ' + url);
  return response;
}

export async function eventually(action, tries = 14, delay = 2500) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try { return await action(); } catch (error) {
      if (attempt === tries) throw error;
      await sleep(delay);
    }
  }
}
