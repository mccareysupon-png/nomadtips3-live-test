import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const RUNTIME_DIR = path.join(ROOT, 'runtime');

const DEFAULT_CONFIG = {
  car31: {
    baseUrl: 'https://nomadtips3-car31-goaloo.mccarey-supon.workers.dev',
    historyLimit: 100,
    pollSeconds: 15,
    bootstrapMode: 'tail'
  },
  lmStudio: {
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'auto',
    temperature: 0.1,
    maxTokens: 500,
    timeoutMs: 45000
  },
  analysis: {
    trigger: 'confirmed-history',
    requireCar31Confirmation: true,
    allowMissingLiveContext: true
  },
  execution: {
    mode: 'paper',
    paperStakeUnits: 1,
    manualOutbox: true,
    xxx: {
      enabled: false,
      note: 'Reserved extension point. Intentionally not implemented here.'
    }
  }
};

function merge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(base?.[key] && typeof base[key] === 'object' ? base[key] : {}, value)
      : value;
  }
  return out;
}

export async function ensureRuntime() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

export async function loadConfig() {
  const candidates = [path.join(ROOT, 'config.json'), path.join(ROOT, 'config.example.json')];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      return merge(DEFAULT_CONFIG, parsed);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error(`Config error in ${file}: ${error.message}`);
    }
  }
  return structuredClone(DEFAULT_CONFIG);
}

export async function fetchJson(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status} ${url}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

export async function detectLmStudioModel(config) {
  if (config.lmStudio.model && config.lmStudio.model !== 'auto') return config.lmStudio.model;
  const base = normalizeBaseUrl(config.lmStudio.baseUrl);
  const models = await fetchJson(`${base}/models`, {}, config.lmStudio.timeoutMs);
  const rows = Array.isArray(models?.data) ? models.data : [];
  const preferred = rows.find(row => !/embed|embedding/i.test(String(row?.id || ''))) || rows[0];
  if (!preferred?.id) throw new Error('LM Studio server is reachable but no model is visible. Load a chat model first.');
  return preferred.id;
}

export function recordKey(record) {
  if (record?.key) return String(record.key);
  return [record?.id, record?.selectedAt, record?.market, record?.selectedSide].map(v => String(v ?? '')).join(':');
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJsonAtomic(file, value) {
  await ensureRuntime();
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temp, file);
}

export async function appendJsonl(file, value) {
  await ensureRuntime();
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, 'utf8');
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
