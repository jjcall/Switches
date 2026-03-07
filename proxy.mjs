/**
 * Tiny CORS proxy for local Figma plugin development.
 *
 * Figma plugin iframes run with a null origin, which Anthropic's API rejects
 * (no Access-Control-Allow-Origin: * header). This proxy adds the required
 * CORS headers and forwards requests to api.anthropic.com.
 *
 * Supports both regular and streaming (SSE) responses.
 *
 * Usage:
 *   node proxy.mjs          # default port 3333
 *   PORT=4000 node proxy.mjs
 *
 * Point PROXY_URL in claude.ts to http://localhost:3333
 */

import http from 'http';
import https from 'https';

const PORT = parseInt(process.env.PORT ?? '3333', 10);
const TARGET_HOST = 'api.anthropic.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, content-type, anthropic-beta',
  'Access-Control-Max-Age': '600',
};

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  const targetPath = req.url ?? '/v1/messages';

  // Drop accept-encoding so Anthropic returns uncompressed JSON.
  // If we forward it, Anthropic may return gzip which the browser would
  // try to decompress again (double-decode = garbage).
  const { 'accept-encoding': _dropped, ...forwardHeaders } = req.headers;

  const options = {
    hostname: TARGET_HOST,
    port: 443,
    path: targetPath,
    method: 'POST',
    headers: {
      ...forwardHeaders,
      host: TARGET_HOST,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const contentType = proxyRes.headers['content-type'] ?? 'application/json';
    const isStreaming = contentType.includes('text/event-stream');

    const responseHeaders = {
      ...CORS_HEADERS,
      'Content-Type': contentType,
    };

    if (isStreaming) {
      responseHeaders['Cache-Control'] = 'no-cache';
      responseHeaders['Connection'] = 'keep-alive';
    }

    res.writeHead(proxyRes.statusCode ?? 200, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy] upstream error:', err.message);
    res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Proxy upstream error: ${err.message}` } }));
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] Anthropic CORS proxy running on http://localhost:${PORT}`);
  console.log(`[proxy] Forwarding POST /* → https://${TARGET_HOST}/*`);
});
