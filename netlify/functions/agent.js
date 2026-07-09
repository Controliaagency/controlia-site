const { verifyToken, unauthorized, preflight } = require('./_verify');

const SYSTEM = `Tu es le mentor commercial d'Enzo, fondateur de Controlia.

Controlia vend aux artisans du bâtiment (paysagistes, plombiers, maçons, piscinistes, électriciens) :
- Sites internet professionnels
- Écosystème digital (Google, réseaux sociaux, avis clients, référencement local)
- Intégration IA (automatisation, agents IA, outils intelligents)

TON RÔLE : Tu es un mentor de vente — direct, chaleureux, motivant. Tu analyses les données en temps réel et tu dis à Enzo exactement ce qu'il doit faire maintenant pour faire du chiffre. Tu ne suggères pas, tu diriges. Tu crois en lui, tu le pousses, tu ne le laisses pas souffler quand y'a du boulot.

STYLE :
- Utilise "Enzo" naturellement
- 3 à 5 phrases max, fluides, percutantes
- Texte naturel, pas de listes ni de tirets
- Commence par ce qui est le plus urgent ou le plus impactant
- Si c'est calme : challenge-le à viser plus haut
- Si c'est chargé : priorise et donne de l'énergie
- Mentionne des contacts par nom quand c'est pertinent (prénom + contexte)
- Adapte le ton à l'heure et au contexte (matin = énergie, fin de journée = bilan)
- Sois humain, pas corporate`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!verifyToken(auth)) return unauthorized();

  try {
    const data    = JSON.parse(event.body || '{}');
    const context = buildContext(data);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 280,
        system:     SYSTEM,
        messages:   [{ role: 'user', content: context }],
      }),
    });

    const result  = await res.json();
    const message = result.content?.[0]?.text || null;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ message }),
    };
  } catch (err) {
    console.error('agent error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function buildContext({ kpi = {}, relances = {}, contacts = [], heure = '', jour = '' }) {
  const retard     = relances.retard     || [];
  const aujourdhui = relances.aujourdhui || [];

  const byStatut = (s) => contacts.filter(c => c.statut === s);
  const valPipeline = contacts
    .filter(c => !['Gagné', 'Perdu'].includes(c.statut))
    .reduce((s, c) => s + (Number(c.valeur) || 0), 0);

  const fmtContact = c =>
    `${c.nom}${c.entreprise ? ' ('+c.entreprise+')' : ''}${c.secteur ? ' - '+c.secteur : ''}${c.valeur ? ' - '+c.valeur+'€' : ''}${c.statut ? ' ['+c.statut+']' : ''}`;

  const urgent = [
    ...retard.map(c => '⚠️ RETARD : ' + fmtContact(c)),
    ...aujourdhui.map(c => '📅 Aujourd\'hui : ' + fmtContact(c)),
  ].join('\n') || 'Aucune relance urgente';

  const propositions = byStatut('Proposition');
  const rdvs         = byStatut('RDV');

  return `SITUATION EN TEMPS RÉEL — ${jour}, ${heure}

PERFORMANCE DU JOUR :
Appels : ${kpi.appelsJour || 0} / ${kpi.objAppels || 30} (objectif)
RDV pris : ${kpi.rdvJour || 0} | Ventes : ${kpi.ventesJour || 0}
Conversion globale : ${kpi.conv || 0}% | CA gagné total : ${kpi.caGagne || 0}€

PIPELINE (${contacts.length} contacts) :
Nouveaux non contactés : ${byStatut('Nouveau').length}
En contact : ${byStatut('Contacté').length}
RDV planifiés : ${rdvs.length}${rdvs.length ? ' → ' + rdvs.map(c => c.nom).join(', ') : ''}
Propositions : ${propositions.length}${propositions.length ? ' → ' + propositions.map(c => c.nom + (c.valeur ? ' '+c.valeur+'€' : '')).join(', ') : ''}
Valeur totale pipeline : ${valPipeline}€

RELANCES URGENTES :
${urgent}

Donne ton brief à Enzo. Sois direct, chaleureux, motivant. Dis-lui exactement quoi faire maintenant.`;
}
