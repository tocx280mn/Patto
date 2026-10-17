#!/usr/bin/env node
/**
 * server.js - Servidor de desarrollo para Patto (equivalente a server.py, en Node).
 *
 * Sirve index.html Y hace de proxy /proxy.php hacia Reflection AI / Beam.
 *
 * Por que hace falta:
 *   1) api.reflection.ai NO manda cabeceras CORS -> el navegador no puede llamarla directo.
 *   2) En local no hay PHP, asi que proxy.php no correria.
 *
 * Uso:
 *     1. Asegurate de que la key esta en proxy.php (REFLECTION_API_KEY).
 *     2. node server.js
 *     3. Abre http://localhost:8000
 *
 * Este archivo es SOLO para local: NO lo subas al hosting.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..'); // la app vive un nivel arriba de dev/
const HOST = '127.0.0.1';
const PORT = parseInt(process.env.PORT || '8000', 10);

const REFLECTION_URL = 'https://api.reflection.ai/openai/v1/chat/completions';
const REFLECTION_MODEL = 'Beam-1.0-501B-A23B';

/* La key puede estar en: la variable de entorno (tiene prioridad), un archivo
   patto_secret.php (fuera de la carpeta web) o el respaldo dentro de proxy.php. */
let keyOrigen = '';
function keyFromProxyPhp() {
  const candidatos = [
    path.join(ROOT, '..', 'patto_secret.php'),
    path.join(ROOT, '..', '..', 'patto_secret.php'),
    path.join(ROOT, 'patto_secret.php'),
  ];
  for (const f of candidatos) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      const m = txt.match(/REFLECTION_API_KEY'\s*,\s*'([^']+)'/);
      if (m && m[1]) { keyOrigen = f; return m[1]; }
    } catch (e) { /* no existe: seguimos */ }
  }
  try {
    const txt = fs.readFileSync(path.join(ROOT, 'proxy.php'), 'utf8');
    const m = txt.match(/const\s+REFLECTION_API_KEY\s*=\s*'([^']*)'/) ||
              txt.match(/\$patto_key_fallback\s*=\s*'([^']*)'/);
    if (m && m[1] && m[1] !== 'TU_API_KEY_AQUI') { keyOrigen = path.join(ROOT, 'proxy.php'); return m[1]; }
  } catch (e) { /* ignorar */ }
  return '';
}
const REFLECTION_API_KEY = process.env.REFLECTION_API_KEY || keyFromProxyPhp() || 'PEGA_TU_KEY_AQUI';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.psc': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function corsHeaders(res) {
  // Servidor SOLO para desarrollo local (no se sube al hosting). Se refleja el
  // origen que pide en vez de responder "*", para que una web ajena no pueda
  // usar tu proxy de localhost desde el navegador.
  const origen = (res.req && res.req.headers && res.req.headers.origin) || '';
  if (origen) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function sendJsonError(res, code, message) {
  const body = Buffer.from(JSON.stringify({ error: { message: message } }), 'utf8');
  corsHeaders(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

/* ── Busqueda web sin API key: DuckDuckGo HTML (principal) + Wikipedia (respaldo) ── */

function decodeDdgUrl(href) {
  if (href.startsWith('//')) href = 'https:' + href;
  const m = href.match(/[?&]uddg=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : href;
}

function plain(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function ddgHtml(query, limit = 5) {
  const u = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  const resp = await fetch(u, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9'
    },
    signal: AbortSignal.timeout(15000)
  });
  const page = await resp.text();
  const anchors = [...page.matchAll(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snippets = [...page.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  const out = [];
  for (let i = 0; i < Math.min(anchors.length, limit); i++) {
    const href = anchors[i][1];
    const title = anchors[i][2];
    const snip = i < snippets.length ? plain(snippets[i][1]) : '';
    out.push((i + 1) + '. ' + plain(title) + ': ' + snip + ' (' + decodeDdgUrl(href) + ')');
  }
  return out;
}

async function wikipedia(query, limit = 3) {
  const api = 'https://es.wikipedia.org/w/api.php?action=query&format=json&utf8=1&list=search&srlimit=' +
    limit + '&srsearch=' + encodeURIComponent(query);
  const resp = await fetch(api, { signal: AbortSignal.timeout(12000) });
  const data = await resp.json();
  const hits = (data && data.query && data.query.search) || [];
  return hits.slice(0, limit).map(h => {
    const title = h.title || '';
    const snippet = plain(h.snippet || '');
    const link = 'https://es.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
    return '- ' + title + ': ' + snippet + ' (' + link + ')';
  });
}

async function webSearch(query) {
  const q = String(query || '').trim();
  if (!q) return 'No se proporciono ninguna consulta de busqueda.';
  const parts = [];
  try {
    const r = await ddgHtml(q);
    if (r.length) parts.push('Resultados web:\n' + r.join('\n'));
  } catch (e) { /* seguimos con Wikipedia */ }
  if (!parts.length) {
    try {
      const w = await wikipedia(q);
      if (w.length) parts.push('Wikipedia:\n' + w.join('\n'));
    } catch (e) { /* nada */ }
  }
  let text = parts.join('\n\n').trim();
  if (!text) text = 'No se encontraron resultados en internet para: ' + q;
  return text.slice(0, 4000);
}

/* ── Proxy hacia Beam (streaming SSE) ── */
async function handleProxy(req, res, query) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    sendJsonError(res, 400, 'Invalid JSON');
    return;
  }

  if (query.action === 'search') {
    const text = await webSearch(payload.query || '');
    const body = Buffer.from(JSON.stringify({ text: text }), 'utf8');
    corsHeaders(res);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
    res.end(body);
    return;
  }

  payload.model = REFLECTION_MODEL;
  payload.stream = true;
  const body = Buffer.from(JSON.stringify(payload), 'utf8');

  /* OJO: no se puede usar AbortSignal.timeout() aquí: aborta la petición COMPLETA a los
     X segundos, y con razonamiento MAX el stream dura más, cortando la respuesta a mitad.
     En su lugar se usa un "watchdog" de inactividad: solo aborta si pasa demasiado tiempo
     SIN recibir ni un byte. */
  const IDLE_MS = 120000;   // 2 minutos sin datos -> abortar
  const controller = new AbortController();
  let idleTimer = null;
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), IDLE_MS);
  };
  armIdle();

  let upstream;
  try {
    upstream = await fetch(REFLECTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + REFLECTION_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: body,
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(idleTimer);
    sendJsonError(res, 502, 'Proxy error: ' + (e && e.message ? e.message : e));
    return;
  }

  if (!upstream.ok) {
    clearTimeout(idleTimer);
    const detail = await upstream.text().catch(() => '');
    sendJsonError(res, upstream.status, detail || ('Upstream HTTP ' + upstream.status));
    return;
  }

  corsHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    'Connection': 'close'
  });

  try {
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();                       // llegaron datos: reiniciamos el watchdog
      res.write(Buffer.from(value));
    }
  } catch (e) { /* cliente desconectado, timeout de inactividad, etc. */ }
  clearTimeout(idleTimer);
  try {
    res.write('data: [DONE]\n\n');
  } catch (e) { /* ignorar */ }
  res.end();
}

/* ── Archivos estaticos ── */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  // OJO: nunca servir el codigo fuente PHP como texto plano. proxy.php lleva la
  // API key dentro, asi que un GET directo la expondria (en produccion lo ejecuta
  // PHP, pero en local no hay PHP y este servidor lo leeria como archivo).
  if (/\.php$/i.test(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') {
    corsHeaders(res);
    res.writeHead(204, { 'Content-Length': 0 });
    res.end();
    return;
  }

  if (req.method === 'POST' && (pathname === '/proxy.php' || pathname === '/proxy')) {
    handleProxy(req, res, { action: parsed.searchParams.get('action') }).catch(e => {
      try { sendJsonError(res, 500, 'Proxy error: ' + e.message); } catch (e2) { /* ignorar */ }
    });
    console.log('%s - POST %s', req.socket.remoteAddress, req.url);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, pathname);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405 Method Not Allowed');
});

server.listen(PORT, HOST, () => {
  if (REFLECTION_API_KEY.includes('PEGA_TU_KEY_AQUI') || REFLECTION_API_KEY.includes('TU_API_KEY_AQUI')) {
    console.log('!! Aviso: no se encontro la API key. Define la variable de entorno');
    console.log('   REFLECTION_API_KEY o crea patto_secret.php en la carpeta padre de la app.');
  } else {
    console.log('API key cargada desde ' +
      (process.env.REFLECTION_API_KEY ? 'la variable de entorno REFLECTION_API_KEY' : keyOrigen) +
      ' (len=' + REFLECTION_API_KEY.length + ')');
  }
  console.log('Patto dev server -> http://' + HOST + ':' + PORT + '   (Ctrl+C para salir)');
});
