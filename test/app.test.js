import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { LruCache } from '../src/cache.js';
import { createRateLimiter } from '../src/rateLimit.js';
import { encode } from '../src/base62.js';

// Sobe um servidor de verdade numa porta livre, com banco em memória.
async function startApp({ createLimit = 100, redirectLimit = 100, cacheSize = 100 } = {}) {
  const db = createDb(':memory:');
  const cache = new LruCache(cacheSize);
  const server = createApp({
    db,
    cache,
    baseUrl: 'http://short.test',
    limiters: {
      create: createRateLimiter({ limit: createLimit, windowMs: 60_000 }),
      redirect: createRateLimiter({ limit: redirectLimit, windowMs: 60_000 }),
    },
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');

  const base = `http://127.0.0.1:${server.address().port}`;
  const shorten = (url) =>
    fetch(`${base}/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  const open = (code) => fetch(`${base}/${code}`, { redirect: 'manual' });

  return { db, cache, server, base, shorten, open };
}

test('base62', () => {
  assert.equal(encode(0), '0');
  assert.equal(encode(61), 'Z');
  assert.equal(encode(62), '10');
});

test('cria o link e redireciona', async (t) => {
  const { server, shorten, open } = await startApp();
  t.after(() => server.close());

  const res = await shorten('https://example.com/pagina?a=1');
  assert.equal(res.status, 201);
  const { code, shortUrl } = await res.json();
  assert.equal(shortUrl, `http://short.test/${code}`);

  const redirect = await open(code);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://example.com/pagina?a=1');
});

test('primeiro acesso vai ao banco (MISS), o segundo vem do cache (HIT)', async (t) => {
  const { server, shorten, open } = await startApp();
  t.after(() => server.close());

  const { code } = await (await shorten('https://example.com')).json();
  assert.equal((await open(code)).headers.get('x-cache'), 'MISS');
  assert.equal((await open(code)).headers.get('x-cache'), 'HIT');
});

test('o cache LRU expulsa o menos usado', () => {
  const cache = new LruCache(2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a'); // "a" fica mais recente que "b"
  cache.set('c', 3); // estoura o limite: "b" sai
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
});

test('rejeita URL inválida e esquemas perigosos', async (t) => {
  const { server, shorten } = await startApp();
  t.after(() => server.close());

  for (const url of ['nao-e-url', 'javascript:alert(1)', 'ftp://example.com', undefined]) {
    assert.equal((await shorten(url)).status, 400, String(url));
  }
});

test('serve o site: página, estilo e script', async (t) => {
  const { server, base } = await startApp();
  t.after(() => server.close());

  const page = await fetch(`${base}/?utm_source=teste`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Encurte seus links/);

  const css = await fetch(`${base}/style.css`);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = await fetch(`${base}/script.js`);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('código inexistente retorna 404', async (t) => {
  const { server, open } = await startApp();
  t.after(() => server.close());

  assert.equal((await open('zzzz')).status, 404);
});

test('rate limit devolve 429 com Retry-After', async (t) => {
  const { server, shorten } = await startApp({ createLimit: 2 });
  t.after(() => server.close());

  assert.equal((await shorten('https://a.com')).status, 201);
  assert.equal((await shorten('https://b.com')).status, 201);
  const blocked = await shorten('https://c.com');
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});

test('a busca por código usa o índice (não varre a tabela)', () => {
  const { raw } = createDb(':memory:');
  const plan = raw.prepare('EXPLAIN QUERY PLAN SELECT url FROM links WHERE code = ?').all('abc');
  assert.match(plan[0].detail, /USING INDEX idx_links_code/);
});
