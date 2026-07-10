const fs = require('node:fs');

// Minimal .env loader so local runs (LaunchAgent, npm start) pick up TURSO_DATABASE_URL /
// TURSO_AUTH_TOKEN without adding a dependency. On Vercel these vars are injected directly
// into process.env by the platform, so this is a no-op there (no .env file present).
function loadEnvFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

module.exports = { loadEnvFile };
