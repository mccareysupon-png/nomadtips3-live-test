import {
  detectLmStudioModel,
  fetchJson,
  loadConfig,
  normalizeBaseUrl
} from './shared.mjs';

function line(label, ok, detail = '') {
  const mark = ok ? 'OK ' : 'ERR';
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const config = await loadConfig();
  let failed = false;

  line('Node.js', Number(process.versions.node.split('.')[0]) >= 18, process.version);
  if (Number(process.versions.node.split('.')[0]) < 18) failed = true;

  const carBase = normalizeBaseUrl(config.car31.baseUrl);
  try {
    const health = await fetchJson(`${carBase}/health?t=${Date.now()}`, {}, 20000);
    const ok = Boolean(health?.ok);
    line('CAR 3.1 /health', ok, `live=${health?.liveMatches ?? '?'} history=${health?.historyTotal ?? '?'}`);
    if (!ok) failed = true;
  } catch (error) {
    line('CAR 3.1 /health', false, error.message);
    failed = true;
  }

  try {
    const history = await fetchJson(`${carBase}/history?page=1&limit=5&t=${Date.now()}`, {}, 20000);
    const ok = Boolean(history?.ok && Array.isArray(history.records));
    line('CAR 3.1 /history', ok, `records=${history?.records?.length ?? '?'}`);
    if (!ok) failed = true;
  } catch (error) {
    line('CAR 3.1 /history', false, error.message);
    failed = true;
  }

  const lmBase = normalizeBaseUrl(config.lmStudio.baseUrl);
  try {
    const host = new URL(lmBase).hostname;
    const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
    line('LM Studio local address', local, lmBase);
    if (!local) failed = true;
  } catch (error) {
    line('LM Studio URL', false, error.message);
    failed = true;
  }

  try {
    const model = await detectLmStudioModel(config);
    line('LM Studio /v1/models', true, model);
  } catch (error) {
    line('LM Studio /v1/models', false, error.message);
    failed = true;
  }

  console.log('');
  if (failed) {
    console.log('Doctor found one or more problems. Start/load a chat model in LM Studio and start its local server, then run doctor again.');
    process.exitCode = 1;
  } else {
    console.log('READY — CAR 3.1 and the local LM Studio model are reachable.');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
