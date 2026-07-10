const { verifyToken, supaFetch, respond, preflight, unauthorized } = require('./_verify');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!verifyToken(auth)) return unauthorized();

  const method = event.httpMethod;
  const id     = (event.queryStringParameters || {}).id;

  try {
    if (method === 'GET') {
      const res  = await supaFetch('/memories?order=created_at.desc');
      return respond(res.ok ? await res.json() : []);
    }
    if (method === 'POST') {
      const body = JSON.parse(event.body);
      const res  = await supaFetch('/memories', { method: 'POST', body: JSON.stringify(body) });
      return respond(await res.json(), res.ok ? 201 : 400);
    }
    if (method === 'DELETE') {
      if (!id) return respond({ error: 'id manquant' }, 400);
      await supaFetch('/memories?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      return respond({ ok: true });
    }
    return respond({ error: 'Méthode non supportée' }, 405);
  } catch (err) {
    console.error('memory error:', err);
    return respond({ error: err.message }, 500);
  }
};
