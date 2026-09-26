export class SearchError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function validateQuery(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    throw new SearchError('Zadejte dotaz o délce 1 až 200 znaků.', 400);
  }
  return value.trim();
}

// Only this collection is eligible: ads, places and knowledgeGraph are ignored.
export function extractOrganic(data) {
  if (!data || !Array.isArray(data.organic)) {
    throw new SearchError('Vyhledávač vrátil neočekávaný formát dat.');
  }
  return data.organic.map(item => {
    let url;
    try { url = new URL(item.link); } catch { /* validated below */ }
    if (!item || !Number.isInteger(item.position) || item.position < 1 ||
        typeof item.title !== 'string' || !item.title.trim() ||
        !url || !['http:', 'https:'].includes(url.protocol) ||
        (item.snippet != null && typeof item.snippet !== 'string')) {
      throw new SearchError('Vyhledávač vrátil neplatný výsledek.');
    }
    return {
      position: item.position,
      title: item.title,
      link: item.link,
      description: item.snippet ?? ''
    };
  });
}

export async function searchGoogle(value, { apiKey, fetchImpl = fetch } = {}) {
  const query = validateQuery(value);
  if (!apiKey) throw new SearchError('Na serveru chybí konfigurace vyhledávání.', 503);
  let response;
  try {
    response = await fetchImpl('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'cz', hl: 'cs', page: 1, num: 10 }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw new SearchError('Vyhledávač není dostupný. Zkuste to později.',
      error.name === 'TimeoutError' ? 504 : 502);
  }
  if (!response.ok) throw new SearchError('Vyhledávač požadavek odmítl. Zkuste to později.');
  let data;
  try { data = await response.json(); }
  catch { throw new SearchError('Vyhledávač vrátil nečitelnou odpověď.'); }
  return {
    query, engine: 'google', provider: 'serper', page: 1,
    country: 'cz', language: 'cs',
    results: extractOrganic(data)
  };
}
