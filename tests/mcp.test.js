import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { traiter } from "../src/index.js";
import { OUTILS } from "../src/outils.js";
import { base, ErreurOutil } from "../src/base.js";

const outil = (n) => OUTILS.find((o) => o.name === n);
const M = "22222222-2222-4222-8222-222222222222";
const ctxVide = { db: null, journal: () => {} };

test("initialize et tools/list", async () => {
  const r = await traiter({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }, ctxVide);
  assert.equal(r.result.serverInfo.name, "anti");
  const l = await traiter({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctxVide);
  assert.deepEqual(l.result.tools.map((t) => t.name).sort(),
    ["declarer_prospect", "ecrire_equipe", "estimer_potentiel", "mes_prospects", "mes_releves", "mon_espace", "prospect", "questionnaire", "rechercher_entreprise"]);
  for (const t of l.result.tools) assert.equal(t.faire, undefined);
});

test("Worker : 401 et métadonnées de ressource protégée", async () => {
  const env = { SUPABASE_URL: "https://exemple.supabase.co" };
  const r = await worker.fetch(new Request("https://mcp.ant-i.agency/mcp", { method: "POST", body: "{}" }), env);
  assert.equal(r.status, 401);
  assert.match(r.headers.get("www-authenticate"), /mcp\.ant-i\.agency\/\.well-known\/oauth-protected-resource\/mcp/);
  const m = await (await worker.fetch(new Request("https://mcp.ant-i.agency/.well-known/oauth-protected-resource"), env)).json();
  assert.equal(m.resource, "https://mcp.ant-i.agency/mcp");
});

function fausseBase() {
  const appels = [];
  return {
    appels,
    rpc: async (nom, args) => { appels.push(["rpc", nom, args]); return nom === "espace_partenaire" ? { statut: "particulier" } : 1; },
    table: async (chemin) => { appels.push(["table", chemin]); return chemin.startsWith("missions?") ? [{ id: M, code: "winlogic", grille: [1] }] : []; },
    fonction: async (nom, corps) => { appels.push(["fonction", nom, corps]); return { id: "p1", statut: "declare" }; },
  };
}

test("declarer_prospect exige l'accord du prospect, sans appel", async () => {
  const db = fausseBase();
  await assert.rejects(outil("declarer_prospect").faire(db, { mission_id: M, contact: { nom: "A", email: "a@b.fr" }, lien: { reponse: "aucun" }, consentement_du_prospect: false }),
    (e) => e instanceof ErreurOutil && e.code === "consentement_requis");
  assert.equal(db.appels.length, 0);
});

test("declarer_prospect : lien « oui » à décrire, puis appel de prospect-declarer", async () => {
  const db = fausseBase();
  await assert.rejects(outil("declarer_prospect").faire(db, { mission_id: M, contact: { nom: "A", email: "a@b.fr" }, lien: { reponse: "oui" }, consentement_du_prospect: true }),
    (e) => e.code === "lien_requis");
  const r = await outil("declarer_prospect").faire(db, { mission_id: M, siren: "552 100 554", contact: { nom: "A", email: "a@b.fr" }, lien: { reponse: "aucun" }, consentement_du_prospect: true });
  assert.equal(r.statut, "declare");
  const [, nom, corps] = db.appels.at(-1);
  assert.equal(nom, "prospect-declarer");
  assert.equal(corps.siren, "552100554");
  assert.equal(corps.consentement, true);
});

test("mon_espace : grille retirée pour un particulier", async () => {
  const r = await outil("mon_espace").faire(fausseBase());
  assert.equal(r.missions[0].grille, null);
});

test("base : 403 oauth_interdit traduit, 401 = reconnexion", async () => {
  const env = { SUPABASE_URL: "https://x", SUPABASE_CLE_PUBLIQUE: "k" };
  const db403 = base(env, "j", async () => new Response(JSON.stringify({ code: "42501", message: "oauth_interdit" }), { status: 403 }));
  await assert.rejects(db403.rpc("retrait"), (e) => e.code === "oauth_interdit" && /espace/.test(e.message));
  const db401 = base(env, "j", async () => new Response("{}", { status: 401 }));
  await assert.rejects(db401.fonction("prospect-declarer", {}), (e) => e.code === "connexion_requise");
  const dbFn = base(env, "j", async () => new Response(JSON.stringify({ erreur: { code: "deja_declare", message: "Déjà." } }), { status: 409 }));
  await assert.rejects(dbFn.fonction("prospect-declarer", {}), (e) => e.code === "deja_declare");
});
