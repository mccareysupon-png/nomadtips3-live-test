import assert from 'node:assert/strict';
const { signedCollectorAuthorized } = await import('../cloudflare-worker/src/v2-routes.js');

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

class MemoryDb {
  constructor() { this.nonces = new Set(); }
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async run() {
        if (/INSERT OR IGNORE INTO v2_auth_nonce/.test(sql)) {
          const nonce = this.values[0];
          if (db.nonces.has(nonce)) return { meta: { changes: 0 } };
          db.nonces.add(nonce);
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }
    };
  }
}

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = crypto.getRandomValues(new Uint8Array(16));
const nonceHex = hex(nonce);
const body = new TextEncoder().encode('{"ok":true}');
const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
const canonical = `POST\n/v2/ingest\n${timestamp}\n${nonceHex}\n${hex(digest)}`;
const signature = new Uint8Array(await crypto.subtle.sign(
  { name: 'Ed25519' }, pair.privateKey, new TextEncoder().encode(canonical)
));
const request = new Request('https://example.test/v2/ingest', {
  method: 'POST',
  body,
  headers: {
    'X-Nomad-Timestamp': timestamp,
    'X-Nomad-Nonce': nonceHex,
    'X-Nomad-Signature': b64(signature)
  }
});
const env = { V2_COLLECTOR_PUBLIC_KEY_B64: b64(publicKey), DB: new MemoryDb() };

assert.equal(await signedCollectorAuthorized(request, env), true);
assert.equal(await signedCollectorAuthorized(request, env), false, 'nonce replay must fail');

const tampered = new Request('https://example.test/v2/ingest', {
  method: 'POST', body: '{"ok":false}', headers: request.headers
});
const env2 = { V2_COLLECTOR_PUBLIC_KEY_B64: b64(publicKey), DB: new MemoryDb() };
assert.equal(await signedCollectorAuthorized(tampered, env2), false);

console.log('V2 Ed25519 signed collector authentication tests passed.');
