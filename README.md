# MCP d'ANT-i

Serveur [MCP](https://modelcontextprotocol.io) distant d'[ANT-i](https://ant-i.agency), le réseau d'apporteurs
d'affaires du groupe Win-Logic. Tu automatises ta prospection avec tes propres outils et ta propre IA ? Branche-les ici
pour **déclarer tes apports et suivre tes prospects, tes affaires et tes commissions** sans passer par l'interface.

Adresse : **`https://mcp.ant-i.agency/mcp`**

> Le partenaire repère un vrai besoin et présente la bonne équipe ; il ne vend ni ne négocie, et les prix restent
> ceux de chaque marque. ANT-i ne vend jamais de prospection. Aucun revenu n'est garanti.

## Se connecter

1. Dans ton assistant (Claude, ChatGPT, Mistral Vibe…), ajoute un connecteur MCP distant avec l'adresse
   `https://mcp.ant-i.agency/mcp`.
2. Une page s'ouvre : connecte-toi avec ton compte (le même sur ant-i.agency et u-man.art), puis clique sur **Autoriser**.
3. C'est tout. Tu retires l'accès quand tu veux depuis ton assistant.

Il faut un espace partenaire ouvert (pro sous contrat, ou particulier) et des missions acceptées sur
[ant-i.agency/espace/](https://ant-i.agency/espace/).

## Outils

| Outil | Rôle |
|---|---|
| `mon_espace` | statut, palier, volume, commissions, missions publiées et acceptées |
| `questionnaire` | questions à poser au prospect pour une mission |
| `rechercher_entreprise` | registre public des entreprises (nom ou SIREN) |
| `estimer_potentiel` | fourchette théorique, pour toi seulement |
| `declarer_prospect` | déclaration horodatée d'un apport |
| `mes_prospects` / `prospect` | prospects, échanges, historique, affaires et commissions |
| `ecrire_equipe` | message à l'équipe sur un prospect |
| `mes_releves` | régime de TVA et relevés d'autofacturation |

**Règles de la déclaration**, tenues par la base comme sur le site : mission acceptée, **contact qui a accepté d'être
contacté** (jamais une liste extraite : RGPD), lien avec la structure déclaré, pas ta propre entreprise, doublons
départagés par la première déclaration complète, 20 déclarations en attente au plus. La grille et le potentiel sont
confidentiels (contrat, art. 12.1) : jamais au prospect.

Accepter une mission, signer, contester un relevé, télécharger un document ou demander un retrait se fait sur le site.

## Fonctionnement et sécurité

- **OAuth 2.1** selon la spécification d'autorisation MCP (ressource protégée RFC 9728 sous
  `/.well-known/oauth-protected-resource/mcp`, serveur d'autorisation Supabase Auth, enregistrement dynamique, PKCE).
- Le serveur **n'a aucun secret ni droit propre** : il vérifie le jeton (ES256, JWKS, émetteur, expiration,
  `client_id`), puis appelle la base et ses fonctions avec le jeton du partenaire.
- **Côté base, un jeton OAuth n'ouvre que les appels de ce MCP et du MCP du registre U-MAN Art** : paiements,
  retraits, coordonnées bancaires, contrats, documents et console restent fermés à tout assistant.
- Suivi : un prospect déclaré par un assistant est marqué comme tel, avec l'application cliente. Les journaux notent
  le compte, l'application et l'outil, jamais le contenu des déclarations.
- Transport « Streamable HTTP », sans état. 60 appels par minute et par compte.

## Développer

```sh
npm test           # tests (node:test, sans réseau)
npm run dev        # serveur local (Wrangler)
npm run deploy     # tests puis déploiement (Worker « anti-mcp », compte du groupe)
```

Aucune dépendance d'exécution. Serveur jumeau : [uman-registre-mcp](https://github.com/Win-Logic-Blue-Roses/uman-registre-mcp).

---

## English

Remote MCP server for ANT-i, the business-referral network of the Win-Logic group. Partners who automate their
prospecting with their own tools and AI connect their assistant to `https://mcp.ant-i.agency/mcp` (OAuth 2.1, dynamic
client registration) to declare referrals and track prospects, deals and commissions. A referral needs the contact's
consent; ANT-i never sells prospecting services. On the database side, OAuth tokens can only reach the calls of the
group's MCP servers.

Licence : MIT, © 2026 WIN-LOGIC BLUE ROSES SAS.
