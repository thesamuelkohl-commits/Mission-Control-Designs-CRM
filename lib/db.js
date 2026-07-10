const { createClient } = require('@libsql/client');

let client = null;

function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) {
      throw new Error('TURSO_DATABASE_URL is not set. Add it to .env (local) or the Vercel project env vars.');
    }
    client = createClient({ url, authToken, intMode: 'number' });
  }
  return client;
}

function rowsToPlain(result) {
  return result.rows.map((row) => {
    const obj = {};
    for (const col of result.columns) obj[col] = row[col];
    return obj;
  });
}

// Small shim so the rest of the app can keep using the same
// prepare(sql).run(...) / .get(...) / .all(...) shape it used with node:sqlite,
// even though the underlying Turso client is async over HTTP.
function prepare(sql) {
  return {
    async run(...args) {
      const result = await getClient().execute({ sql, args });
      return { lastInsertRowid: result.lastInsertRowid, changes: result.rowsAffected };
    },
    async get(...args) {
      const result = await getClient().execute({ sql, args });
      return rowsToPlain(result)[0];
    },
    async all(...args) {
      const result = await getClient().execute({ sql, args });
      return rowsToPlain(result);
    },
  };
}

async function exec(sql) {
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await getClient().execute(statement);
  }
}

let schemaReadyPromise = null;

function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await exec(`
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          company TEXT,
          emails TEXT NOT NULL DEFAULT '[]',
          phones TEXT NOT NULL DEFAULT '[]',
          links TEXT NOT NULL DEFAULT '[]',
          last_contacted TEXT,
          tag TEXT NOT NULL DEFAULT 'cold',
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      await exec(`
        CREATE TABLE IF NOT EXISTS outreach_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          contact_id INTEGER NOT NULL,
          message TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        )
      `);
      // contacts predates lead ownership; add the column if it's not there yet,
      // and backfill any existing leads to "sam" since that's who created them.
      try {
        await exec('ALTER TABLE contacts ADD COLUMN owner TEXT');
      } catch {
        // column already exists — fine.
      }
      await exec("UPDATE contacts SET owner = 'sam' WHERE owner IS NULL");
      // outreach_log predates per-user attribution; add the column if it's not
      // there yet, and backfill historical entries to "sam" for the same reason.
      try {
        await exec('ALTER TABLE outreach_log ADD COLUMN username TEXT');
      } catch {
        // column already exists — fine.
      }
      await exec("UPDATE outreach_log SET username = 'sam' WHERE username IS NULL");
      await exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        )
      `);
      await exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          salt TEXT NOT NULL,
          hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
      // sessions predates multi-user login; add the linking column if it's not there yet.
      try {
        await exec('ALTER TABLE sessions ADD COLUMN username TEXT');
      } catch {
        // column already exists — fine.
      }
    })();
  }
  return schemaReadyPromise;
}

module.exports = { prepare, exec, ensureSchema };
