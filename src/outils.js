// Outils du MCP d'ANT-i, le réseau d'apporteurs d'affaires du groupe Win-Logic. Pour les partenaires (pro sous contrat
// ou particuliers) qui automatisent leur prospection avec leurs propres outils et leur propre IA : déclarer leurs
// apports, suivre leurs prospects, leurs affaires et leurs commissions. ANT-i ne vend jamais de prospection.
// Chaque appel passe par la base avec le jeton du partenaire : mêmes règles que ant-i.agency/espace/.

import { ErreurOutil } from "./base.js";

export const SITE = "https://ant-i.agency";
const API_QUESTIONNAIRES = "https://api.ant-i.agency/v1/questionnaires";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = (v, nom) => {
  if (typeof v !== "string" || !UUID.test(v)) throw new ErreurOutil("parametre_invalide", `« ${nom} » doit être un identifiant (UUID).`);
  return v;
};
const texte = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

let cacheQuestionnaires = { valeur: null, expire: 0 };
async function questionnaires(chercher) {
  if (cacheQuestionnaires.valeur && Date.now() < cacheQuestionnaires.expire) return cacheQuestionnaires.valeur;
  const r = await chercher(API_QUESTIONNAIRES, { cf: { cacheTtl: 300 } });
  if (!r.ok) throw new ErreurOutil("questionnaires", "Questionnaires indisponibles pour le moment.");
  const { questionnaires: q } = await r.json();
  cacheQuestionnaires = { valeur: q, expire: Date.now() + 5 * 60 * 1000 };
  return q;
}

async function missionsPubliees(db) {
  const [missions, acceptees] = await Promise.all([
    db.table("missions?publiee_le=not.is.null&retiree_le=is.null&order=ordre&select=id,code,version,titre,marque,accroche,public_vise,taux_pct,taux_prefixe,duree_attribution_mois,grille,conditions,infos_commande"),
    db.table("missions_acceptees?select=mission_id,acceptee_le"),
  ]);
  const quand = new Map((acceptees ?? []).map((a) => [a.mission_id, a.acceptee_le]));
  return (missions ?? []).map((m) => ({ ...m, acceptee_le: quand.get(m.id) ?? null }));
}

async function espaceOuvert(db) {
  const e = await db.rpc("espace_partenaire");
  if (!e) throw new ErreurOutil("reserve_partenaire", `Ton espace s'ouvre une fois ton contrat signé, ou en recommandant en particulier : ${SITE}/espace/`);
  return e;
}

const LECTURE = { readOnlyHint: true, openWorldHint: false };
const vide = { type: "object", properties: {}, additionalProperties: false };

export const OUTILS = [
  {
    name: "mon_espace",
    title: "Mon espace partenaire",
    description: "Tableau de bord du partenaire ANT-i : statut (pro ou particulier), palier, volume des 12 derniers mois, commissions à verser, en attente et versées, et les missions publiées (marques du groupe Win-Logic) avec la date d'acceptation. Une mission doit être acceptée sur ant-i.agency avant de pouvoir y déclarer un prospect. La grille des commissions est confidentielle (contrat, art. 12.1) : ne la communique jamais à un prospect.",
    inputSchema: vide,
    annotations: LECTURE,
    async faire(db) {
      const espace = await espaceOuvert(db);
      const particulier = espace.statut === "particulier";
      const missions = (await missionsPubliees(db)).map((m) => (particulier ? { ...m, grille: null } : m));
      return { espace, missions, accepter_une_mission: `${SITE}/espace/` };
    },
  },
  {
    name: "questionnaire",
    title: "Questions d'une mission",
    description: "Questions de qualification à poser au prospect pour une mission (code : winlogic, astrx, uman, uman_registre, uman_collections…). Les réponses (clé → valeur, une valeur parmi « options » pour une question « choix ») vont dans « reponses » de declarer_prospect et d'estimer_potentiel.",
    inputSchema: { type: "object", required: ["mission"], properties: { mission: { type: "string", description: "Code de la mission (voir mon_espace)." } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async faire(_db, a, ctx) {
      const q = await questionnaires(ctx.chercher);
      const code = texte(a.mission, 40);
      if (!q[code]) throw new ErreurOutil("mission_inconnue", `Mission inconnue. Codes : ${Object.keys(q).join(", ")}.`);
      return { mission: code, questions: q[code] };
    },
  },
  {
    name: "rechercher_entreprise",
    title: "Rechercher une entreprise",
    description: "Recherche une structure au registre public des entreprises (nom ou SIREN, 3 caractères au moins) : dénomination officielle, SIREN, activité, état. Donne le SIREN à declarer_prospect pour une déclaration vérifiée.",
    inputSchema: { type: "object", required: ["q"], properties: { q: { type: "string", minLength: 3, maxLength: 100 } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async faire(db, a) { return db.fonction("rechercher-entreprise", { q: texte(a.q, 100) }); },
  },
  {
    name: "estimer_potentiel",
    title: "Estimer le potentiel",
    description: "Fourchette théorique de commission pour un prospect, d'après les réponses au questionnaire. Usage interne du partenaire seulement : ne la communique jamais au prospect, et ce n'est ni une promesse ni un revenu garanti.",
    inputSchema: {
      type: "object", required: ["mission_id", "reponses"],
      properties: { mission_id: { type: "string", format: "uuid" }, reponses: { type: "object", description: "Réponses au questionnaire (clé → valeur)." } },
      additionalProperties: false,
    },
    annotations: LECTURE,
    async faire(db, a) {
      if (!a.reponses || typeof a.reponses !== "object" || Array.isArray(a.reponses)) throw new ErreurOutil("reponses_invalides", "Réponses manquantes.");
      return (await db.rpc("prospect_potentiel", { p_mission: uuid(a.mission_id, "mission_id"), p_reponses: a.reponses })) ?? {};
    },
  },
  {
    name: "declarer_prospect",
    title: "Déclarer un prospect",
    description: "Déclare un apport (contrat ANT-i, annexe 1 art. 5) : une structure qui a un vrai besoin pour une marque du groupe, et un contact qui a ACCEPTÉ d'être contacté par l'équipe. Déclaration horodatée, qui fixe l'attribution ; doublons, propre entreprise et plafond de 20 déclarations en attente sont contrôlés par la base. Ne déclare jamais une liste extraite ou un contact qui n'a pas donné son accord (RGPD) : un prospect qui ne confirme pas n'est pas attribué. Indique toujours si le partenaire a un lien avec la structure. Le partenaire présente la bonne équipe ; il ne vend ni ne négocie, et ne promet aucun prix.",
    inputSchema: {
      type: "object",
      required: ["mission_id", "contact", "lien", "consentement_du_prospect"],
      properties: {
        mission_id: { type: "string", format: "uuid", description: "Mission acceptée (voir mon_espace)." },
        siren: { type: "string", description: "SIREN (9 chiffres) : la dénomination officielle est reprise du registre." },
        denomination: { type: "string", maxLength: 250, description: "Nom de la structure ou du projet, si pas de SIREN (projet pas encore immatriculé)." },
        contact: {
          type: "object", required: ["nom", "email"],
          properties: { nom: { type: "string" }, fonction: { type: "string" }, email: { type: "string" }, telephone: { type: "string" } },
          additionalProperties: false,
        },
        lien: {
          type: "object", required: ["reponse"],
          properties: { reponse: { type: "string", enum: ["aucun", "oui"] }, description: { type: "string", maxLength: 1000, description: "Si oui : lequel (famille, associé, client, employeur…)." } },
          additionalProperties: false,
          description: "Lien du partenaire avec la structure (contrat-cadre, art. 10.2).",
        },
        reponses: { type: "object", description: "Réponses au questionnaire de la mission." },
        notes: { type: "string", maxLength: 3000 },
        consentement_du_prospect: { type: "boolean", description: "true seulement si le contact a accepté d'être contacté par l'équipe du groupe Win-Logic." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async faire(db, a) {
      if (a.consentement_du_prospect !== true) throw new ErreurOutil("consentement_requis", "Le prospect doit avoir accepté d'être contacté : demande-lui d'abord son accord.");
      if (a.lien?.reponse === "oui" && texte(a.lien.description, 1000).length < 3) throw new ErreurOutil("lien_requis", "Décris ton lien avec cette structure.");
      return db.fonction("prospect-declarer", {
        mission: uuid(a.mission_id, "mission_id"), siren: a.siren ? String(a.siren).replace(/\s/g, "") : null,
        denomination: texte(a.denomination, 250), contact: a.contact ?? {}, lien: a.lien ?? {},
        reponses: a.reponses ?? {}, notes: texte(a.notes, 3000) || null, consentement: true,
      });
    },
  },
  {
    name: "mes_prospects",
    title: "Mes prospects",
    description: "Prospects déclarés par le partenaire : structure, mission, statut (declare, confirme, en_discussion, gagne, perdu, non_attribue…), potentiel théorique, date de déclaration et fin d'attribution.",
    inputSchema: vide,
    annotations: LECTURE,
    async faire(db) {
      return { prospects: await db.table("prospects?select=id,denomination,siren,mission_code,statut,motif,potentiel_min,potentiel_max,declare_le,attribue_jusqu_au&order=declare_le.desc") ?? [] };
    },
  },
  {
    name: "prospect",
    title: "Fiche d'un prospect",
    description: "Fiche complète d'un prospect : réponses, échanges avec l'équipe, historique de l'apport (journal en ajout seul, la preuve du partenaire), affaires et commissions.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } }, additionalProperties: false },
    annotations: LECTURE,
    async faire(db, a) {
      const p = uuid(a.id, "id");
      const [fiches, echanges, suivi, affaires] = await Promise.all([
        db.table(`prospects?id=eq.${p}&select=*`),
        db.table(`prospect_echanges?prospect_id=eq.${p}&select=id,de_l_equipe,message,le&order=le`),
        db.table(`suivi?prospect_id=eq.${p}&select=id,objet,texte,le&order=le,id`),
        db.table(`affaires?prospect_id=eq.${p}&select=id,offre,statut,signee_le,attribuee,attribution_motif,commissions(id,montant,statut,valide_le,verse_le,motif)&order=creee_le`),
      ]);
      if (!fiches?.length) throw new ErreurOutil("prospect_introuvable", "Ce prospect est introuvable sur ton compte.");
      return { prospect: fiches[0], echanges: echanges ?? [], suivi: suivi ?? [], affaires: affaires ?? [] };
    },
  },
  {
    name: "ecrire_equipe",
    title: "Écrire à l'équipe",
    description: "Envoie un message à l'équipe ANT-i sur un prospect (nouvelle information, rendez-vous obtenu, question). Le message reste dans le fil de la fiche.",
    inputSchema: { type: "object", required: ["prospect_id", "message"], properties: { prospect_id: { type: "string", format: "uuid" }, message: { type: "string", minLength: 2, maxLength: 2000 } }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async faire(db, a) {
      const message = texte(a.message, 2000);
      if (message.length < 2) throw new ErreurOutil("message_vide", "Le message est vide.");
      return { id: await db.rpc("prospect_ecrire", { p_prospect: uuid(a.prospect_id, "prospect_id"), p_message: message }) };
    },
  },
  {
    name: "mes_releves",
    title: "Mes relevés",
    description: "Régime de TVA déclaré et relevés mensuels d'autofacturation (ou reçus d'un particulier) : période, montants, statut, paiement. Les documents PDF et XML se téléchargent depuis l'espace sur ant-i.agency ; une contestation s'y fait aussi.",
    inputSchema: vide,
    annotations: LECTURE,
    async faire(db) {
      const [infos, releves] = await Promise.all([
        db.rpc("ma_facturation"),
        db.table("releves?select=id,nature,numero,periode,emis_le,echeance,contestable_jusqu_au,total_ht,total_tva,total_ttc,statut,paye_le&order=periode.desc"),
      ]);
      return { facturation: infos ?? null, releves: releves ?? [], espace: `${SITE}/espace/` };
    },
  },
];
