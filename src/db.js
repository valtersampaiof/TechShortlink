import { DatabaseSync } from 'node:sqlite';
import { encode } from './base62.js';

export function createDb(path) {
  const raw = new DatabaseSync(path);

  raw.exec(`
    CREATE TABLE IF NOT EXISTS links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT,
      url        TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_links_code ON links (code);
  `);

  const insert = raw.prepare('INSERT INTO links (url) VALUES (?)');
  const setCode = raw.prepare('UPDATE links SET code = ? WHERE id = ?');
  const selectByCode = raw.prepare('SELECT url FROM links WHERE code = ?');

  return {
    raw, // exposto só para os testes inspecionarem o plano de consulta

    // O código curto é o id convertido para base62, então nunca colide.
    // Como só conhecemos o id depois do INSERT, fazemos os dois passos numa transação.
    create(url) {
      raw.exec('BEGIN');
      try {
        const { lastInsertRowid: id } = insert.run(url);
        const code = encode(id);
        setCode.run(code, id);
        raw.exec('COMMIT');
        return code;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },

    findUrl(code) {
      return selectByCode.get(code)?.url ?? null;
    },
  };
}
