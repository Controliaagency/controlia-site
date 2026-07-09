const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { login, password } = JSON.parse(event.body || '{}');

    if (
      login    !== process.env.ADMIN_LOGIN    ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: 'Identifiants incorrects' }),
      };
    }

    /* Build token: base64(payload).hmac */
    const payload = JSON.stringify({
      login,
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 jours
    });
    const dataB64 = Buffer.from(payload).toString('base64');
    const sig = crypto
      .createHmac('sha256', process.env.ADMIN_SECRET || 'changeme')
      .update(payload)
      .digest('hex');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ token: dataB64 + '.' + sig }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
