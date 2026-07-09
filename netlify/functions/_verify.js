const crypto = require('crypto');

/* ── Token verification ───────────────────────────────── */
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const dataB64 = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  try {
    const data     = Buffer.from(dataB64, 'base64').toString('utf8');
    const expected = crypto
      .createHmac('sha256', process.env.ADMIN_SECRET || 'changeme')
      .update(data)
      .digest('hex');
    if (sig !== expected) return null;
    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

/* ── Supabase REST helper ─────────────────────────────── */
function supaFetch(path, options = {}) {
  const url = process.env.SUPABASE_URL + '/rest/v1' + path;
  return fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_SECRET_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
}

/* ── Response helpers ─────────────────────────────────── */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function respond(data, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(data),
  };
}

function preflight() {
  return { statusCode: 200, headers: CORS, body: '' };
}

function unauthorized() {
  return respond({ error: 'Non autorisé' }, 401);
}

module.exports = { verifyToken, supaFetch, respond, preflight, unauthorized };
