import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOrganic, validateQuery, searchGoogle } from '../src/search.js';
import { serializeExport } from '../src/export.js';
import { makeServer } from '../src/server.js';

const fixture = {
  organic: [
    { position: 1, title: 'České výlety', link: 'https://example.com/vylety', snippet: 'Tipy na výlety.', sitelinks: [{ title: 'Extra' }] },
    { position: 3, title: 'Praha', link: 'https://example.org/' }
  ],
  ads: [{ position: 1, title: 'Reklama', link: 'https://ads.example.com' }],
  places: [{ title: 'Místo' }],
  knowledgeGraph: { title: 'Graf' }
};
const expected = [
  { position: 1, title: 'České výlety', link: 'https://example.com/vylety', description: 'Tipy na výlety.' },
  { position: 3, title: 'Praha', link: 'https://example.org/', description: '' }
];
const mockFetch = async () => new Response(JSON.stringify(fixture));

test('exact output contains only organic fields, preserves positions and handles missing snippet', () => {
  const before = structuredClone(fixture);
  assert.deepEqual(extractOrganic(fixture), expected);
  assert.deepEqual(fixture, before);
});
test('empty organic results are a valid empty array', () => {
  assert.deepEqual(extractOrganic({ organic: [] }), []);
});
test('malformed upstream data is rejected instead of presented as no results', () => {
  for (const value of [null, {}, { organic: {} }, { organic: [null] },
    { organic: [{ ...fixture.organic[0], link: 'javascript:alert(1)' }] },
    { organic: [{ ...fixture.organic[0], position: '1' }] }]) {
    assert.throws(() => extractOrganic(value), { status: 502 });
  }
});
test('input validation rejects empty, wrong type and oversized queries', () => {
  for (const value of ['', '   ', null, [], 123, 'a'.repeat(201)]) {
    assert.throws(() => validateQuery(value), { status: 400 });
  }
  assert.equal(validateQuery('  české výlety  '), 'české výlety');
});
test('provider receives first page, Czech locale and server-only key; export round trips exactly', async () => {
  let calls = 0;
  const data = await searchGoogle(' výlety ', {
    apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://google.serper.dev/search');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-API-KEY'], 'test-secret');
      assert.deepEqual(JSON.parse(options.body), { q: 'výlety', page: 1, num: 10, gl: 'cz', hl: 'cs' });
      assert.ok(options.signal instanceof AbortSignal);
      return mockFetch();
    }
  });
  assert.equal(calls, 1);
  const expectedExport = { query: 'výlety', engine: 'google', provider: 'serper', page: 1, country: 'cz', language: 'cs', results: expected };
  assert.deepEqual(data, expectedExport);
  assert.deepEqual(JSON.parse(serializeExport(data)), expectedExport);
  assert.ok(!serializeExport(data).includes('test-secret'));
});
test('invalid input and absent configuration never call provider', async () => {
  const unexpected = () => { assert.fail('Provider must not be called'); };
  await assert.rejects(searchGoogle(' ', { apiKey: 'key', fetchImpl: unexpected }), { status: 400 });
  await assert.rejects(searchGoogle('query', { fetchImpl: unexpected }), { status: 503 });
});
test('provider failure, timeout and broken JSON return controlled errors', async () => {
  for (const [fetchImpl, status] of [
    [async () => new Response('secret details', { status: 401 }), 502],
    [async () => { throw new Error('network'); }, 502],
    [async () => { throw new DOMException('timeout', 'TimeoutError'); }, 504],
    [async () => new Response('broken json'), 502]
  ]) {
    await assert.rejects(searchGoogle('query', { apiKey: 'key', fetchImpl }), error => {
      assert.equal(error.status, status);
      assert.ok(!error.message.includes('secret details'));
      return true;
    });
  }
});
test('GET route accepts q, preserves Unicode and special characters, and returns exact JSON', async t => {
  const receivedQueries = [];
  const server = makeServer({ apiKey: 'key', fetchImpl: async (url, options) => {
    receivedQueries.push(JSON.parse(options.body).q);
    return mockFetch();
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const query = 'kavárny Praha & čaj + C#';
  const response = await fetch(`${base}/api/search?${new URLSearchParams({ q: query })}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    query, engine: 'google', provider: 'serper', page: 1,
    country: 'cz', language: 'cs', results: expected
  });
  assert.deepEqual(receivedQueries, [query]);

  const post = await fetch(`${base}/api/search`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
  for (const suffix of ['', '?q=', '?q=%20%20', '?q=one&q=two', `?q=${'a'.repeat(201)}`]) {
    assert.equal((await fetch(`${base}/api/search${suffix}`)).status, 400);
  }
  assert.equal(receivedQueries.length, 1, 'Invalid queries must not call the provider');
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/src/server.js`)).status, 404);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.ok(page.headers.get('content-security-policy').includes("style-src 'self'"));
  const html = await page.text();
  assert.equal((html.match(/<input\b/g) || []).length, 1);
  assert.match(html, /lang="cs"/);
  assert.match(html, /action="\/api\/search" method="get"/);
  assert.match(html, /name="q"/);
  assert.ok(!html.includes('<style>'));
  for (const file of ['/app.js', '/style.css', '/export.js']) {
    assert.equal((await fetch(`${base}${file}`)).status, 200);
  }
});

test('HTTP server reports missing API configuration without exposing details', async t => {
  const server = makeServer({ apiKey: '' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search?q=Praha`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Na serveru chybí konfigurace vyhledávání.' });
});

test('global rate limit rejects the 21st request without calling provider', async t => {
  let calls = 0;
  const server = makeServer({ apiKey: 'key', fetchImpl: async () => {
    calls++;
    return mockFetch();
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/search?q=Praha`;
  for (let i = 0; i < 20; i++) {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    await response.json();
  }
  const limited = await fetch(url);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(calls, 20);
});
