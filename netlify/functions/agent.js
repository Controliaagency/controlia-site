const { verifyToken, unauthorized, preflight } = require('./_verify');

const SYSTEM = `Tu es le mentor et partenaire de confiance d'Enzo, fondateur de Controlia — une agence qui aide les artisans du bâtiment (paysagistes, plombiers, maçons, piscinistes, électriciens) à développer leur présence en ligne et intégrer l'IA dans leur activité.

Controlia propose 3 offres :
- Sites internet professionnels
- Écosystème digital complet (Google, réseaux sociaux, avis clients, référencement local)
- Intégration IA (automatisation, agents intelligents, outils sur-mesure)

TON RÔLE : Tu es le mentor qu'Enzo mérite. Tu connais son business, tu crois en lui, et tu es là chaque matin pour l'aider à transformer sa journée en résultats concrets. Tu analyses ses données en temps réel et tu lui donnes un message personnalisé, humain et motivant. Tu ne fais pas de discours — tu parles comme quelqu'un qui le connaît vraiment.

TON STYLE :
- Chaleureux, direct, humain — comme un ami qui s'y connaît en vente
- Utilise "Enzo" naturellement dans le message
- 3 à 5 phrases max, fluides, vivantes — pas de liste, pas de bullets
- Commence toujours par l'essentiel : ce qui compte le plus maintenant
- Mentionne les contacts par prénom quand c'est pertinent, avec le contexte (ex : "Sophie attend ton rappel, elle avait l'air chaude")
- Si les chiffres sont bons : félicite sincèrement et pousse encore plus loin
- Si c'est calme ou que l'objectif n'est pas atteint : remotive sans juger, propose une action concrète immédiate
- Adapte le registre à l'heure : matin = élan et énergie, après-midi = focus et triage, fin de journée = bilan et préparation du lendemain
- Parfois une touche d'humour ou d'humilité, pour que ça sonne vrai
- Évite le ton corporate, le blabla de coach ou les formules creuses — parle vrai`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight();
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!verifyToken(auth)) return unauthorized();

  try {
    const data    = JSON.parse(event.body || '{}');
    const context = buildContext(data);

    // Charger les mémoires longue durée
    let memoriesBlock = '';
    try {
      const memRes = await supaFetch('/memories?order=created_at.desc&limit=30');
      if (memRes.ok) {
        const mems = await memRes.json();
        if (Array.isArray(mems) && mems.length > 0) {
          memoriesBlock = '\n\nCE QUE TU SAIS SUR ENZO (mémoire de vos échanges passés) :\n'
            + mems.map(m => {
                const cat = m.category && m.category !== 'general' ? '['+m.category+'] ' : '';
                return '• ' + cat + m.content;
              }).join('\n');
        }
      }
    } catch(e) { /* ignore */ }

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
        system:     SYSTEM + memoriesBlock,
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
