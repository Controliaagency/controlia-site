const { verifyToken, supaFetch, respond, preflight, unauthorized } = require('./_verify');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();

  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!verifyToken(auth)) return unauthorized();

  const method = event.httpMethod;
  const id     = (event.queryStringParameters || {}).id;

  try {
    /* ── GET : liste tous les devis ── */
    if (method === 'GET') {
      const res  = await supaFetch('/devis?order=date_creation.desc');
      const data = await res.json();
      return respond(res.ok ? data : [], res.ok ? 200 : 500);
    }

    /* ── POST : création ── */
    if (method === 'POST') {
      const body = JSON.parse(event.body);
      const res  = await supaFetch('/devis', {
        method: 'POST',
        body:   JSON.stringify(body),
      });
      const data = await res.json();
      return respond(data, res.ok ? 201 : 400);
    }

    /* ── PUT : mise à jour ── */
    if (method === 'PUT') {
      if (!id) return respond({ error: 'id manquant' }, 400);
      const body = JSON.parse(event.body);
      const res  = await supaFetch('/devis?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        body:   JSON.stringify(body),
      });
      const data = await res.json();
      return respond(data, res.ok ? 200 : 400);
    }

    /* ── DELETE : suppression ── */
    if (method === 'DELETE') {
      if (!id) return respond({ error: 'id manquant' }, 400);
      await supaFetch('/devis?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      return respond({ ok: true });
    }

    return respond({ error: 'Méthode non supportée' }, 405);
  } catch (err) {
    console.error('devis error:', err);
    return respond({ error: err.message }, 500);
  }
};
