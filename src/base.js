// Appels à la base d'ANT-i (PostgREST, schéma public) et à ses Edge Functions, avec le jeton du partenaire.
// Le MCP n'a aucun droit propre : la RLS et les fonctions de la base décident, comme sur ant-i.agency/espace/.
// Côté base, un jeton OAuth n'ouvre que les appels de ce MCP (migration garde_oauth du projet ANT-i).

export class ErreurOutil extends Error {
  constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}

const MESSAGES = {
  oauth_interdit: "Cet appel n'est pas ouvert aux assistants : fais-le depuis ton espace sur ant-i.agency.",
  connexion_requise: "Connexion expirée : reconnecte ANT-i dans ton assistant.",
};

export function base(env, jeton, chercher = fetch) {
  const entetes = {
    apikey: env.SUPABASE_CLE_PUBLIQUE,
    Authorization: `Bearer ${jeton}`,
    "Content-Type": "application/json",
  };

  async function lire(r, fonction = false) {
    const texte = await r.text();
    let corps = null;
    try { corps = texte ? JSON.parse(texte) : null; } catch { corps = null; }
    if (r.ok) return corps;
    if (r.status === 401) throw new ErreurOutil("connexion_requise", MESSAGES.connexion_requise);
    if (fonction) {                               // Edge Function : { erreur: { code, message } } ou { code, message }
      const e = corps?.erreur ?? corps ?? {};
      throw new ErreurOutil(e.code ?? `http_${r.status}`, e.message ?? "La demande n'a pas abouti.");
    }
    const code = corps?.message ?? `http_${r.status}`;
    throw new ErreurOutil(code, MESSAGES[code] ?? "La base a refusé la demande.", corps?.details ?? undefined);
  }

  return {
    rpc: async (nom, args = {}) => lire(await chercher(`${env.SUPABASE_URL}/rest/v1/rpc/${nom}`, {
      method: "POST", headers: entetes, body: JSON.stringify(args),
    })),
    table: async (chemin) => lire(await chercher(`${env.SUPABASE_URL}/rest/v1/${chemin}`, { headers: entetes })),
    fonction: async (nom, corps) => lire(await chercher(`${env.SUPABASE_URL}/functions/v1/${nom}`, {
      method: "POST", headers: entetes, body: JSON.stringify(corps ?? {}),
    }), true),
  };
}
