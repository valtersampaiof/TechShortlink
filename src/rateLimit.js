// Rate limit por "janela fixa": cada chave (IP) pode fazer `limit` requisições
// dentro de cada janela de `windowMs` milissegundos.
export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map(); // chave -> { count, resetAt }

  // Limpa de tempos em tempos as janelas vencidas, para o Map não crescer para sempre.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref(); // unref: este timer não impede o processo de encerrar

  return function check(key) {
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count++;
    return {
      allowed: entry.count <= limit,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000), // segundos até a janela abrir
    };
  };
}
