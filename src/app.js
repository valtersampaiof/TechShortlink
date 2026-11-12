import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_URL_LENGTH = 2048;
const MAX_BODY_BYTES = 10_000;

// Lista fechada dos arquivos do site: rota -> [arquivo em public/, Content-Type].
// Só serve o que está aqui, então ninguém consegue pedir "/../src/db.js".
const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
]);

// Recebe tudo de que precisa por parâmetro (banco, cache, limiters),
// o que facilita trocar por versões de teste.
export function createApp({ db, cache, limiters, baseUrl }) {
  return http.createServer(async (req, res) => {
    const ip = req.socket.remoteAddress;
    const route = req.url.split('?')[0]; // ignora ?utm_source=... e afins

    if (req.method === 'GET' && STATIC_FILES.has(route)) {
      return serveStatic(res, ...STATIC_FILES.get(route));
    }

    if (req.method === 'POST' && route === '/shorten') {
      return shorten(req, res, ip);
    }

    const match = req.method === 'GET' && route.match(/^\/([0-9a-zA-Z]+)$/);
    if (match) {
      return redirect(res, ip, match[1]);
    }

    json(res, 404, { error: 'not found' });
  });

  async function serveStatic(res, file, contentType) {
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(await readFile(path.join(PUBLIC_DIR, file)));
  }

  async function shorten(req, res, ip) {
    if (isLimited(res, limiters.create, ip)) return;

    let body;
    try {
      body = await readJson(req);
    } catch {
      return json(res, 400, { error: 'invalid JSON body' });
    }

    const url = parseHttpUrl(body?.url);
    if (!url) {
      return json(res, 400, { error: 'url must be a valid http(s) URL' });
    }

    const code = db.create(url);
    json(res, 201, { code, shortUrl: `${baseUrl}/${code}` });
  }

  // Cache-aside: tenta o cache; se falhar, busca no banco e guarda no cache.
  function redirect(res, ip, code) {
    if (isLimited(res, limiters.redirect, ip)) return;

    let url = cache.get(code);
    const cacheStatus = url ? 'HIT' : 'MISS';

    if (!url) {
      url = db.findUrl(code);
      if (!url) return json(res, 404, { error: 'link not found' });
      cache.set(code, url);
    }

    // 302 (e não 301) para o navegador não guardar o redirect para sempre.
    res.writeHead(302, { Location: url, 'X-Cache': cacheStatus });
    res.end();
  }
}

function isLimited(res, limiter, ip) {
  const { allowed, retryAfter } = limiter(ip);
  if (!allowed) {
    json(res, 429, { error: 'too many requests' }, { 'Retry-After': retryAfter });
  }
  return !allowed;
}

// Só aceita http/https: impede links "javascript:..." e afins.
function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    return isHttp && url.href.length <= MAX_URL_LENGTH ? url.href : null;
  } catch {
    return null;
  }
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new Error('body too large');
  }
  return JSON.parse(body);
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}
