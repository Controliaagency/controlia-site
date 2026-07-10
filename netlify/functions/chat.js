const { verifyToken, supaFetch, respond, preflight, unauthorized } = require('./_verify');

/* ── Charge les souvenirs depuis Supabase ── */
async function loadMemories() {
  try {
    const res = await supaFetch('/memories?order=created_at.desc&limit=40');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

/* ── Sauvegarde un souvenir ── */
async function saveMemory(content, category = 'general') {
  try {
    await supaFetch('/memories', {
      method: 'POST',
      body: JSON.stringify({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        content,
        category,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (e) { console.error('saveMemory error:', e); }
}

/* ── Construit le contexte CRM ── */
function buildContext({ kpi = {}, contacts = [], relances = {}, heure = '', jour = '' }) {
  const retard     = relances.retard     || [];
  const aujourdhui = relances.aujourdhui || [];
  const byStatut   = s => contacts.filter(c => c.statut === s);
  const valPipeline = contacts
    .filter(c => !['Gagné', 'Perdu'].includes(c.statut))
    .reduce((s, c) => s + (Number(c.valeur) || 0), 0);

  const hot = [
    ...retard.map(c => `⚠️ RETARD : ${c.nom}${c.entreprise ? ' (' + c.entreprise + ')' : ''} [${c.statut}]${c.valeur ? ' — ' + c.valeur + '€' : ''}`),
    ...aujourdhui.map(c => `📅 Aujourd'hui : ${c.nom}${c.entreprise ? ' (' + c.entreprise + ')' : ''} [${c.statut}]`),
  ].join('\n') || 'Aucune relance urgente';

  const props = byStatut('Proposition');
  const rdvs  = byStatut('RDV');

  return `SITUATION D'ENZO — ${jour} ${heure}
Appels : ${kpi.appelsJour || 0}/${kpi.objAppels || 30} | RDV : ${kpi.rdvJour || 0} | Ventes : ${kpi.ventesJour || 0}
Pipeline total : ${valPipeline}€ | Conversion : ${kpi.conv || 0}% | CA gagné : ${kpi.caGagne || 0}€
RDV planifiés : ${rdvs.length}${rdvs.length ? ' → ' + rdvs.map(c => c.nom).join(', ') : ''}
Propositions : ${props.length}${props.length ? ' → ' + props.map(c => c.nom + (c.valeur ? ' ' + c.valeur + '€' : '')).join(', ') : ''}
Nouveaux non contactés : ${byStatut('Nouveau').length}
RELANCES URGENTES :\n${hot}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!verifyToken(auth)) return unauthorized();

  try {
    const { messages = [], kpi, contacts, relances, heure, jour } = JSON.parse(event.body || '{}');

    /* Charger les souvenirs */
    const memories = await loadMemories();
    const memoriesText = memories.length > 0
      ? 'CE QUE TU SAIS SUR ENZO (ta mémoire long terme) :\n' + memories.map(m => '• ' + m.content).join('\n')
      : '';

    const context = buildContext({ kpi, contacts: contacts || [], relances: relances || {}, heure, jour });

    const system = `Tu es le mentor et partenaire de confiance d'Enzo, fondateur de Controlia — une agence qui aide les artisans du bâtiment à développer leur présence en ligne et intégrer l'IA.

Controlia vend : sites internet pro, écosystème digital (Google, réseaux, avis, SEO local), intégration IA.
Clients : paysagistes, plombiers, maçons, piscinistes, électriciens.

${memoriesText}

${context}

TON RÔLE DANS CETTE CONVERSATION :
Tu es un ami de confiance qui connaît bien le business d'Enzo. Tu peux l'aider sur tout :
- Stratégie de prospection et priorisation des contacts
- Scripts d'appel adaptés au secteur du prospect (plombier ≠ paysagiste)  
- Réponses aux objections (prix, timing, confiance)
- Analyse du pipeline, conseils concrets sur quoi faire maintenant
- Rédaction d'emails ou de messages pour ses prospects
- Célébration des victoires et motivation quand c'est difficile

STYLE : Chaleureux, direct, humain. Parle comme un ami qui s'y connaît vraiment en vente. Pas de blabla corporate, pas de listes à rallonge — du concret, du vrai.`;

    /* Appel principal à Claude */
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 600,
        system,
        messages:   messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const data   = await res.json();
    const reply  = data.content?.[0]?.text || '';

    /* Extraire les souvenirs importants de façon asynchrone */
    if (reply && messages.length > 0) {
      extractAndSaveMemories(messages, reply).catch(() => {});
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('chat error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

async function extractAndSaveMemories(messages, lastReply) {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 200,
      system:     `Tu extrais les faits importants à mémoriser d'une conversation entre Enzo (fondateur de Controlia) et son mentor.
Retourne UNIQUEMENT un JSON array d'objets (max 2 items), ou [] si rien d'important.

Format STRICT : [{"content": "fait à retenir", "category": "categorie"}]

Catégories disponibles :
- "objection" : objection récurrente d'un prospect (ex: "Les plombiers disent souvent que c'est trop cher")
- "prospect" : info sur un prospect spécifique (ex: "Sophie Martin est très intéressée, rappeler jeudi matin")
- "preference" : préférence ou habitude d'Enzo (ex: "Enzo préfère appeler le matin avant 11h")
- "decision" : décision ou stratégie prise (ex: "Enzo va se concentrer sur les paysagistes ce mois-ci")
- "pattern" : pattern observé dans son activité (ex: "Le secteur pisciniste convertit mieux l'été")
- "general" : tout autre fait durable important

Ne retiens PAS : données KPI brutes, infos temporaires, évidences générales.
Ne retiens QUE des insights durables et actionnables.`,
      messages: [
        { role: 'user', content: `Message d'Enzo : "${lastUser.content}"\nRéponse du mentor : "${lastReply}"\n\nQuels faits importants et durables faut-il mémoriser ? Réponds avec un JSON array.` }
      ],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || '[]';
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const facts = JSON.parse(cleaned);
    if (Array.isArray(facts)) {
      for (const f of facts.slice(0, 2)) {
        if (f && typeof f === 'object' && f.content && f.content.length > 10) {
          await saveMemory(f.content, f.category || 'general');
        } else if (typeof f === 'string' && f.length > 10) {
          await saveMemory(f, 'general');
        }
      }
    }
  } catch {}
}
