// One-time migration: copies all contacts + outreach_log rows from the local
// SQLite file (data/crm.db) into the Turso database, preserving IDs so
// outreach_log.contact_id references stay correct. Safe to re-run: uses
// INSERT OR IGNORE, so already-migrated rows are skipped.
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

require('../lib/env').loadEnvFile(path.join(__dirname, '..', '.env'));

const db = require('../lib/db');

async function main() {
  const localDbPath = path.join(__dirname, '..', 'data', 'crm.db');
  const local = new DatabaseSync(localDbPath);

  await db.ensureSchema();

  const contacts = local.prepare('SELECT * FROM contacts').all();
  const outreach = local.prepare('SELECT * FROM outreach_log').all();

  console.log(`Found ${contacts.length} contacts and ${outreach.length} outreach entries locally.`);

  let contactsInserted = 0;
  for (const c of contacts) {
    const result = await db.prepare(`
      INSERT OR IGNORE INTO contacts
        (id, name, company, emails, phones, links, last_contacted, tag, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      c.id, c.name, c.company, c.emails, c.phones, c.links,
      c.last_contacted, c.tag, c.notes, c.created_at, c.updated_at
    );
    if (result.changes > 0) contactsInserted += 1;
  }

  let outreachInserted = 0;
  for (const o of outreach) {
    const result = await db.prepare(`
      INSERT OR IGNORE INTO outreach_log (id, contact_id, message, created_at)
      VALUES (?, ?, ?, ?)
    `).run(o.id, o.contact_id, o.message, o.created_at);
    if (result.changes > 0) outreachInserted += 1;
  }

  // Keep the AUTOINCREMENT counters ahead of the migrated IDs so new rows
  // created going forward don't collide with the migrated ones.
  async function bumpSequence(table, maxId) {
    if (maxId <= 0) return;
    await db.prepare(
      `INSERT INTO sqlite_sequence (name, seq) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = ?)`
    ).run(table, maxId, table);
    await db.prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = ? AND seq < ?`)
      .run(maxId, table, maxId);
  }

  const maxContactId = contacts.reduce((max, c) => Math.max(max, c.id), 0);
  const maxOutreachId = outreach.reduce((max, o) => Math.max(max, o.id), 0);
  await bumpSequence('contacts', maxContactId);
  await bumpSequence('outreach_log', maxOutreachId);

  console.log(`Inserted ${contactsInserted} new contacts, ${outreachInserted} new outreach entries into Turso.`);
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
