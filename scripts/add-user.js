// Creates or resets a login. Usage:
//   node scripts/add-user.js <username> [password]
// If no password is given, a secure random one is generated and printed once.
const path = require('node:path');
const crypto = require('node:crypto');

require('../lib/env').loadEnvFile(path.join(__dirname, '..', '.env'));

const db = require('../lib/db');

async function main() {
  const usernameArg = process.argv[2];
  if (!usernameArg) {
    console.error('Usage: node scripts/add-user.js <username> [password]');
    process.exit(1);
  }
  const username = usernameArg.trim().toLowerCase();
  const generated = !process.argv[3];
  const password = process.argv[3] || crypto.randomBytes(9).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');

  await db.ensureSchema();
  await db.prepare(`
    INSERT INTO users (username, salt, hash, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET salt = excluded.salt, hash = excluded.hash
  `).run(username, salt, hash, new Date().toISOString());

  console.log(`User "${username}" is ready.`);
  if (generated) console.log(`Password: ${password}`);
}

main().catch((err) => {
  console.error('Failed to add user:', err);
  process.exit(1);
});
