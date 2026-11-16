import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { verifierJeton, JetonInvalide, oublierCles } from "../src/jeton.js";

const EMETTEUR = "https://exemple.supabase.co/auth/v1";
const JWKS = `${EMETTEUR}/.well-known/jwks.json`;
const b64url = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

const paire = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", paire.publicKey)), kid: "k1", alg: "ES256" };
const jwksFetch = async () => new Response(JSON.stringify({ keys: [jwk] }));

async function signer(charge, entete = { alg: "ES256", kid: "k1", typ: "JWT" }, cle = paire.privateKey) {
  const t = `${b64url(entete)}.${b64url(charge)}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, new TextEncoder().encode(t));
  return `${t}.${Buffer.from(sig).toString("base64url")}`;
}
const valide = () => ({ iss: EMETTEUR, sub: "u1", role: "authenticated", aud: "authenticated", client_id: "c1", exp: Math.floor(Date.now() / 1000) + 600 });
const verifier = (j) => verifierJeton(j, { emetteur: EMETTEUR, jwksUrl: JWKS, chercher: jwksFetch });

beforeEach(() => oublierCles());

test("jeton OAuth valide accepté", async () => {
  const c = await verifier(await signer(valide()));
  assert.equal(c.sub, "u1");
  assert.equal(c.client_id, "c1");
});

for (const [cas, modif] of [
  ["expiré", { exp: 1 }],
  ["mauvais émetteur", { iss: "https://autre.supabase.co/auth/v1" }],
  ["anonyme", { role: "anon" }],
  ["session navigateur (sans client_id)", { client_id: undefined }],
]) {
  test(`jeton refusé : ${cas}`, async () => {
    await assert.rejects(verifier(await signer({ ...valide(), ...modif })), JetonInvalide);
  });
}

test("jeton refusé : signé par une autre clé, ou en HS256", async () => {
  const autre = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  await assert.rejects(verifier(await signer(valide(), undefined, autre.privateKey)), JetonInvalide);
  const [h, c, s] = (await signer(valide())).split(".");
  await assert.rejects(verifier(`${b64url({ alg: "HS256", kid: "k1" })}.${c}.${s}`), JetonInvalide);
  await assert.rejects(verifier(`${h}.${b64url({ ...valide(), sub: "u2" })}.${s}`), JetonInvalide);
});

