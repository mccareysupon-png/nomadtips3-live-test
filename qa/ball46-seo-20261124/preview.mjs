import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { HTMLRewriter as WasmRewriter } from 'html-rewriter-wasm';
import { refreshIndex } from './build-fixtures.mjs';
import { frontendSeo, indexFixtures, ORIGIN } from './seo.mjs';

// Node-only adapter for the native Workers HTMLRewriter contract.
export class PreviewRewriter {
  handlers = [];

  on(selector, handlers) {
    this.handlers.push([selector, handlers]);
    return this;
  }

  transform(response) {
    let rewriter;
    const stream = new TransformStream({
      start: controller => {
        rewriter = new WasmRewriter(chunk => {
          if (chunk.length) controller.enqueue(chunk);
        });
        for (const [selector, handlers] of this.handlers) rewriter.on(selector, handlers);
      },
      transform: chunk => rewriter.write(chunk),
      flush: () => rewriter.end(),
    });
    response.body.pipeTo(stream.writable).catch(() => {
      // The readable side propagates the same error to the HTTP response.
    }).finally(() => rewriter.free());
    return new Response(stream.readable, { status: response.status, headers: response.headers });
  }
}

async function upstream(request) {
  const requested = new URL(request.url);
  const remote = new URL(ORIGIN);
  remote.pathname = requested.pathname;
  remote.search = requested.search;
  const response = await fetch(remote, {
    method: request.method, redirect: 'manual',
    headers: { accept: request.headers.get('accept') ?? '*/*' },
    signal: AbortSignal.timeout(30_000),
  });
  const headers = new Headers(response.headers);
  // Node fetch decodes upstream encoding before exposing the body.
  for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie']) headers.delete(name);
  if (headers.has('location')) {
    const target = new URL(headers.get('location'), ORIGIN);
    if (target.origin === ORIGIN || target.origin === 'https://ball46.com') {
      headers.set('location', target.pathname + target.search + target.hash);
    }
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function openPreview({ indexPath, snapshotPath, port = 4176, refresh = false }) {
  let index;
  try {
    index = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    index = await refreshIndex(indexPath, { snapshotPath });
  }
  let fixtures = indexFixtures(index);
  const timer = refresh && setInterval(async () => {
    try {
      index = await refreshIndex(indexPath, { previous: index });
      fixtures = indexFixtures(index);
    } catch (error) {
      console.warn('Kept last good public fixture index:', error.message);
    }
  }, 300_000);

  const server = createServer(async (incoming, outgoing) => {
    try {
      if (!['GET', 'HEAD'].includes(incoming.method)) {
        outgoing.writeHead(405, { allow: 'GET, HEAD', 'x-robots-tag': 'noindex, nofollow' }).end();
        return;
      }
      const request = new Request('http://127.0.0.1' + incoming.url, {
        method: incoming.method,
        headers: incoming.headers,
      });
      const response = await frontendSeo(request, { upstream, fixtures, Rewriter: PreviewRewriter });
      if (outgoing.destroyed) {
        await response.body?.cancel();
        return;
      }
      const headers = new Headers(response.headers);
      headers.set('x-robots-tag', 'noindex, nofollow');
      outgoing.writeHead(response.status, Object.fromEntries(headers));
      if (incoming.method === 'HEAD' || !response.body) outgoing.end();
      else await pipeline(Readable.fromWeb(response.body), outgoing);
    } catch (error) {
      if (outgoing.destroyed || error.code === 'ERR_STREAM_PREMATURE_CLOSE') return;
      if (outgoing.headersSent) {
        outgoing.destroy(error);
      } else {
        outgoing.writeHead(502, { 'x-robots-tag': 'noindex, nofollow', 'content-type': 'text/plain; charset=utf-8' });
        outgoing.end('Preview could not read the public site.');
      }
      console.error(error.message);
    }
  });
  if (timer) server.on('close', () => clearInterval(timer));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [indexPath, snapshotPath] = process.argv.slice(2);
  if (!indexPath) throw new Error('Usage: node preview.mjs INDEX.json [PUBLIC_BOARD_SNAPSHOT.json]');
  const server = await openPreview({ indexPath, snapshotPath, refresh: !snapshotPath });
  console.log('BALL46 SEO preview ready at http://127.0.0.1:' + server.address().port);
}
