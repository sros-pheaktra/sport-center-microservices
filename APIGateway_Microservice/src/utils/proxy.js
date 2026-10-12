const axios = require('axios');
const crypto = require('crypto');

/**
 * Forwards the request to a downstream service.
 *  - client-supplied identity headers are discarded; identity comes only from the verified JWT
 *  - x-internal-key proves to the service that the call came through the gateway
 */
module.exports = (urlEnvKey, { rewrite } = {}) => async (req, res) => {
  const headers = {
    'x-internal-key': process.env.INTERNAL_API_KEY,
    'x-request-id': req.headers['x-request-id'] || crypto.randomUUID(),
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.user) {
    headers['x-user-id'] = req.user.sub;
    headers['x-user-name'] = encodeURIComponent(req.user.name || '');
    headers['x-user-role'] = req.user.role;
  }

  try {
    const upstream = await axios({
      method: req.method,
      url: process.env[urlEnvKey] + (rewrite ? rewrite(req) : req.url), // req.url is relative to the router mount
      data: ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : req.body,
      headers, timeout: 10000, validateStatus: () => true,
    });
    res.set('x-request-id', headers['x-request-id']);
    if (upstream.status === 204 || upstream.data === '') return res.status(upstream.status).end();
    res.status(upstream.status).json(upstream.data);
  } catch (err) {
    res.status(503).json({ message: 'Upstream service unavailable', service: urlEnvKey.replace('_URL', '').toLowerCase() });
  }
};
