const { handleApiRequest, ensureSchema } = require('../lib/routes');

module.exports = async (req, res) => {
  await ensureSchema();
  const url = new URL(req.url, `https://${req.headers.host}`);
  await handleApiRequest(req, res, url.pathname, url.searchParams);
};
