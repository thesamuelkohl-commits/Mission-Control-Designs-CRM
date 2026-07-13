const { handleApiRequest, ensureSchema } = require('../lib/routes');

module.exports = async (req, res) => {
  try {
    await ensureSchema();
    const url = new URL(req.url, `https://${req.headers.host}`);
    await handleApiRequest(req, res, url.pathname, url.searchParams);
  } catch (err) {
    // Surface the real error instead of an opaque platform-level
    // FUNCTION_INVOCATION_FAILED, so misconfiguration (e.g. missing
    // TURSO_DATABASE_URL / TURSO_AUTH_TOKEN env vars) is easy to diagnose.
    console.error('Unhandled API error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: err.message || 'internal server error' }));
  }
};
