import { serializeExport } from '/export.js';

const form = document.querySelector('.search-form');
const input = document.querySelector('#search-input');
const button = document.querySelector('#search-button');
const status = document.querySelector('#status');
const resultsSection = document.querySelector('#results-section');
const resultsQuery = document.querySelector('#results-query');
const results = document.querySelector('#results');
const download = document.querySelector('#download');
let lastResult = null;

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;

  lastResult = null;
  resultsSection.hidden = true;
  results.replaceChildren();
  resultsQuery.textContent = '';
  status.classList.remove('is-error');

  const query = input.value.trim();
  if (!query) {
    status.textContent = 'Zadejte neprázdný dotaz.';
    status.classList.add('is-error');
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = 'Vyhledávám…';
  input.readOnly = true;
  results.setAttribute('aria-busy', 'true');
  status.textContent = 'Vyhledávám…';

  try {
    // Keep the same GET + q contract as the native HTML form.
    const url = new URL(form.action);
    url.searchParams.set(input.name, query);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Vyhledávání se nezdařilo.');

    const fragment = document.createDocumentFragment();
    for (const item of data.results) {
      const li = document.createElement('li');
      li.value = item.position;
      const link = document.createElement('a');
      link.className = 'result-link';
      link.href = item.link;
      link.textContent = item.title;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const urlText = document.createElement('p');
      urlText.className = 'result-url';
      urlText.textContent = item.link;
      const description = document.createElement('p');
      description.className = 'result-description';
      description.textContent = item.description;
      li.append(link, urlText, description);
      fragment.append(li);
    }
    results.append(fragment);
    lastResult = data;
    resultsQuery.textContent = `Dotaz: „${data.query}“`;
    status.textContent = data.results.length
      ? `Počet výsledků: ${data.results.length}`
      : 'Žádné organické výsledky.';
    resultsSection.hidden = false;
  } catch (error) {
    status.classList.add('is-error');
    status.textContent = error.name === 'TimeoutError'
      ? 'Vypršel časový limit. Zkuste to znovu.'
      : error instanceof TypeError || error instanceof SyntaxError
        ? 'Server není dostupný nebo vrátil nečitelnou odpověď. Zkuste to znovu.'
        : error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Vyhledat';
    input.readOnly = false;
    results.setAttribute('aria-busy', 'false');
  }
});

download.addEventListener('click', () => {
  if (!lastResult) return;
  const blob = new Blob([serializeExport(lastResult)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'google-results.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
