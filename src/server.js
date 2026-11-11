import { createApp } from './app.js';
import { createDb } from './db.js';
import { LruCache } from './cache.js';
import { createRateLimiter } from './rateLimit.js';

const PORT = process.env.PORT ?? 3000;
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const DB_PATH = process.env.DB_PATH ?? 'links.db';

const app = createApp({
  db: createDb(DB_PATH),
  cache: new LruCache(10_000),
  baseUrl: BASE_URL,
  limiters: {
    create: createRateLimiter({ limit: 10, windowMs: 60_000 }), // criar é caro: poucas por minuto
    redirect: createRateLimiter({ limit: 120, windowMs: 60_000 }),
  },
});

app.listen(PORT, () => console.log(`Rodando em ${BASE_URL}`));
