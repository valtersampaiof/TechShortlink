const form = document.querySelector('#form');
const input = document.querySelector('#url');
const submit = form.querySelector('button');
const error = document.querySelector('#error');
const result = document.querySelector('#result');
const short = document.querySelector('#short');
const copy = document.querySelector('#copy');

// Chama a API do TechShortlink e devolve o link curto, ou lanÃ§a um Error com
// uma mensagem pronta para mostrar ao usuÃ¡rio.
async function shorten(url) {
  const res = await fetch('/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).catch(() => {
    throw new Error('NÃ£o foi possÃ­vel falar com o servidor.');
  });

  if (res.status === 429) {
    throw new Error(`Muitas tentativas. Tente de novo em ${res.headers.get('Retry-After')}s.`);
  }
  if (!res.ok) {
    throw new Error('Informe uma URL vÃ¡lida, comeÃ§ando com http:// ou https://.');
  }
  return (await res.json()).shortUrl;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault(); // evita o recarregamento da pÃ¡gina
  error.hidden = true;
  result.hidden = true;
  submit.disabled = true;

  try {
    short.textContent = short.href = await shorten(input.value);
    result.hidden = false;
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(short.href);
  copy.textContent = 'Copiado!';
  setTimeout(() => (copy.textContent = 'Copiar'), 1500);
});
