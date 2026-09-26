import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { SearchError, searchGoogle } from './search.js';

const assets = {
  '/': ['../public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['../public/app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['../public/style.css', 'text/css; charset=utf-8'],
  '/export.js': ['./export.js', 'text/javascript; charset=utf-8']
};

export function makeServer({ apiKey = process.env.SERPER_API_KEY, fetchImpl = fetch } = {}) {
  // A simple global quota for a single-process demonstration, not distributed rate limiting.
  let windowStart = Date.now();
  let requests = 0;
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (path === '/api/search') {
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET');
          return send(405, { error: 'Použijte GET.' });
        }
        if (Date.now() - windowStart >= 60000) { requests = 0; windowStart = Date.now(); }
        if (++requests > 20) {
          res.setHeader('Retry-After', '60');
          return send(429, { error: 'Příliš mnoho požadavků. Počkejte minutu.' });
        }
        if (url.searchParams.getAll('q').length !== 1) {
          return send(400, { error: 'Zadejte právě jeden parametr q.' });
        }
        return send(200, await searchGoogle(url.searchParams.get('q'), { apiKey, fetchImpl }));
      }
      if (req.method !== 'GET' || !Object.hasOwn(assets, path)) return send(404, { error: 'Nenalezeno.' });
      const [file, type] = assets[path];
      const content = await readFile(new URL(file, import.meta.url));
      res.writeHead(200, { 'Content-Type': type });
      res.end(content);
    } catch (error) {
      send(error instanceof SearchError ? error.status : 500,
        { error: error instanceof SearchError ? error.message : 'Interní chyba serveru.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  makeServer().listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => {
    console.log(`Server běží na portu ${Number(process.env.PORT) || 3000}`);
  });
}
