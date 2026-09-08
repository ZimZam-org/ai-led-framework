# Configuration AI-Led

Last Updated: {{DATE}}

Ce fichier porte les choix d'outillage du projet. Il en est la source de vérité.
`npx @s2bp/ai-led-framework init` le renseigne, et un humain le modifie à la main à tout
moment. **Les agents le lisent avant d'agir** et adaptent leur comportement, en particulier
quand une intégration vaut `{{DISABLED}}`.

## Identité

- Trigramme projet (préfixe de ticket) : `{{TICKET_PREFIX}}`
  → les tickets de dev portent les noms `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, …

## Style de sortie

- Style de communication des agents et rapports : `{{OUTPUT_STYLE}}`
  → valeurs : `concis` · `standard` · `détaillé` (défaut : `standard`).

**Lu par tous les agents et par `ai-led status`.** Ce réglage pilote *uniquement la présentation* —
jamais le contenu de `memory/`, qui reste la **source de vérité complète et versionnée**. Il
s'applique à : l'affichage dans Claude Code, les synthèses (`/ailed-status`) et le texte poussé
vers les outils externes (Jira / Confluence).

| Valeur     | Comportement attendu |
| ---------- | -------------------- |
| `concis`   | Mode « à l'essentiel ». Pas de préambule ni de conclusion, pas de reformulation de la demande, pas de phrases de transition. Puces courtes (une idée par ligne), tableaux plutôt que prose. Sur Jira : titre + critères d'acceptation en puces, sans narration. |
| `standard` | Synthèse claire et structurée, contexte utile mais sans remplissage. Comportement par défaut. |
| `détaillé` | Explications complètes : raisonnement, alternatives écartées, contexte étendu. Pour onboarding, audits ou revues approfondies. |

> `concis` ne signifie **jamais** omettre une information critique (risque, décision, blocage) :
> on coupe le superflu, pas le fond. La `memory/` est toujours renseignée intégralement, quel
> que soit ce réglage.

## Rédaction

- Norme de rédaction des textes produits : `{{WRITING_NORM}}`
  → valeurs : `ste` · `{{DISABLED}}` (défaut : `ste`).

**Lu par tous les agents.** Les règles vivent dans `memory/writing-rules.md` : profil dérivé de
ASD-STE100 (*Simplified Technical English*), transposé au français. Objectif : un texte compris
immédiatement, et encore compris dans six mois.

`ste` impose 12 règles. Les cinq premières suffisent à changer le résultat :

1. une idée par phrase, 20 mots au maximum (25 pour une instruction) ;
2. voix active, présent, sujet explicite ; impératif pour une instruction ;
3. un terme = un sens : `memory/glossary.md` fait autorité et bannit les synonymes ;
4. aucun sigle absent du glossaire ; trois mots au maximum par groupe nominal ;
5. des faits chiffrés (nombre, ID, nom de fichier) plutôt que des qualificatifs.

**Deux réglages distincts.** Le *Style de sortie* fixe le **volume** du texte. La *Rédaction*
fixe la **forme des phrases**, quel que soit ce volume. Un rapport `détaillé` reste donc
composé de phrases courtes et actives.

**Langue.** Le texte reprend la langue des fichiers `memory/`. Le profil français et le profil
anglais partagent les 12 règles ; seules les listes de tournures interdites diffèrent.

**Hors norme.** Le contenu promotionnel (`/ailed-promo`, sorties promo de
`@ailed-communication`) suit la voix de marque. Le code et les messages de commit suivent
`memory/conventions.md`.

**Contrôle.** `npx @s2bp/ai-led-framework lint` vérifie les règles mesurables sur `memory/`
(`fichier:ligne` + règle). `/ailed-quality-gate` inclut ce contrôle. La valeur `{{DISABLED}}`
désactive la norme et le contrôle.

## Conventions techniques (facultatif)

`memory/conventions.md` décrit les conventions de code et l'organisation technique
**en place**. L'install le renseigne (`--conventions=<chemin>`, import brut) ; sinon un humain
ou `@ailed-init-memory` le complète. **`@ailed-architect`, `@ailed-dev` et `@ailed-ux` le
lisent** avant d'agir. Le fichier peut rester partiellement vide.

## Modèles LLM par agent

Chaque agent tourne sur un **modèle choisi selon sa fonction**. Le but : réduire la
consommation de tokens sans dégrader la qualité là où elle compte.

- `opus` — raisonnement, jugement, revue critique (une mauvaise sortie coûte du rework en aval) ;
- `sonnet` — exécution standard, gros volume (dev, tests, rédaction) ;
- `haiku` — collecte / extraction mécanique, peu de raisonnement.

**Cette table est la source de vérité.** Le harness lit le modèle dans le *frontmatter* de chaque
agent (`.claude/agents/*.md`) : après avoir édité une ligne ci-dessous, applique-la avec
`npx @s2bp/ai-led-framework models sync`. `models` (sans argument) affiche la table effective.
Valeurs possibles : `opus` · `sonnet` · `haiku` · `inherit` (hérite du modèle de session).

{{MODELS_TABLE}}

## Intégrations

| Domaine                | Outil          | Agent / skill concerné            |
| ---------------------- | -------------- | --------------------------------- |
| Monitoring / logs      | `{{MONITORING}}` | `@ailed-check-log`                |
| Tests end-to-end       | `{{E2E}}`        | `@ailed-test`, `@ailed-dev`       |
| Génération promo       | `{{PROMO}}`      | `/ailed-promo`, `@ailed-communication` |
| Veille concurrentielle | `{{WATCH}}`      | `@ailed-scout`, `@ailed-fact-check`, `@ailed-analyst`, `@ailed-monetization` |
| SEO / ASO              | `{{SEO_ASO}}`    | `@ailed-seo-aso` |
| Ticketing externe      | `{{TICKETING}}`  | `@ailed-pm`, `@ailed-planner`, `@ailed-dev`, `@ailed-check-log`, `@ailed-rca`, `@ailed-check-secu` |
| Documentation externe  | `{{DOCUMENTATION}}` | `@ailed-communication` |

> Valeurs possibles : un nom d'outil (ex. `Sentry`, `Playwright`, `Remotion`, `Jira`,
> `Confluence`) ou `{{DISABLED}}`. Devant une intégration à `{{DISABLED}}`, l'agent concerné
> **signale le pré-requis manquant et s'arrête proprement** : il ne suppose jamais un outil.
> Pour activer l'intégration plus tard, remplace `{{DISABLED}}` par le nom de l'outil ici.
> Configure ensuite le MCP ou le pipeline associé.
>
> Deux cas particuliers de la veille. `@ailed-monetization` s'appuie sur le canal **Veille** :
> il n'a pas d'intégration dédiée. `@ailed-seo-aso` **dégrade** vers la **Veille** en confiance
> basse quand **SEO / ASO** vaut `{{DISABLED}}`. Il s'arrête seulement quand la **Veille** vaut
> aussi `{{DISABLED}}`.

### Application locale (rendu d'écrans)

Coordonnées de l'app en local, **lues par `/ailed-screens`** (la planche d'écrans produite en
fin de dev) :

| Champ                                   | Valeur         |
| --------------------------------------- | -------------- |
| URL de base de l'app                    | `à renseigner` |
| Commande de démarrage (facultatif)      | `à renseigner` |
| Compte de test (facultatif)             | `à renseigner` |

> Exemple d'**URL de base** : `http://localhost:3000`. La **commande de démarrage** sert à la
> rappeler à l'humain quand l'app ne répond pas. `/ailed-screens` ne démarre jamais l'app
> lui-même. Le **compte de test** ouvre les écrans authentifiés : n'y mets **jamais de secret
> réel**. Utilise un compte de démo, ou la variable d'environnement qui le porte. Tant que
> l'URL vaut `à renseigner`, la skill **demande la valeur à l'humain puis la réécrit ici**.
> Elle ne capture jamais sur une cible devinée.

### Ticketing & documentation externes (Jira / Confluence via MCP)

Principe **miroir** : la `memory/` reste la **source de vérité locale**. Elle vit hors-ligne,
versionnée git, et `ai-led status` la lit. Quand le projet active le **Ticketing externe**
(ex. `Jira`) ou la **Documentation externe** (ex. `Confluence`), les agents **synchronisent en
plus** vers l'outil via son MCP. Ils ne remplacent jamais la `memory/`.

- **Pré-requis** : le MCP correspondant (ex. MCP Atlassian, qui couvre Jira **et** Confluence) doit
  être connecté dans le Claude Code du projet. Sinon l'agent signale le pré-requis manquant et
  reste en mode fichier-local.
- **Convention d'ID** : quand le **Ticketing externe** est actif, l'**ID de ticket est la clé de
  l'outil** (ex. `{{TICKET_PREFIX}}-123`), le trigramme `{{TICKET_PREFIX}}` servant de **clé de
  projet**. Le format zéro-padded `{{TICKET_PREFIX}}-000001` n'est la convention que du mode
  fichier-local (Ticketing = `{{DISABLED}}`).
- **Sens de synchro (Jira)** : `@ailed-planner` pousse vers Jira le ticket qu'il crée (type
  *feature*). `@ailed-dev` tire un ticket qui **existe déjà** dans Jira, puis le reflète dans
  `memory/kanban.md`. Les **incidents** (`@ailed-check-log`) et les **vulnérabilités
  CRITICAL/HIGH** (`@ailed-check-secu`) créent des issues de type *bug*. `@ailed-rca` enrichit
  le bug lié avec son analyse : cause, impact, reproduction, correction, prévention.
- **Miroir Confluence** : `@ailed-communication` maintient **une page par fichier
  `memory/*.md`** (titre de page = titre du fichier). Ces pages vivent sous la **sous-page
  conteneur `AI LED FRAMEWORK`**, créée sous la **page racine** dont l'URL figure ci-dessous.
  La `memory/` reste la source de vérité ; ces pages en sont le miroir partageable.

**Coordonnées des outils** (lues par les agents avant toute création) :

| Outil      | Champ                                        | Valeur             |
| ---------- | -------------------------------------------- | ------------------ |
| Atlassian  | Site (cloud), si deux sites ou plus          | `à renseigner`     |
| Jira       | Clé de projet (où créer les tickets)         | `{{TICKET_PREFIX}}` |
| Jira       | Type d'issue — feature (`@ailed-planner`)    | `Task`             |
| Jira       | Type d'issue — bug (incident / sécurité)     | `Bug`              |
| Confluence | Page racine (URL de la page parente)         | `à renseigner`     |
| Confluence | Sous-page conteneur (créée si absente)       | `AI LED FRAMEWORK` |

> Exemple de **page racine** : `https://your-company.atlassian.net/wiki/spaces/SPACE/pages/PAGE_ID/Page+Title`.
> Le MCP en déduit l'espace et la page parente. Il crée la sous-page `AI LED FRAMEWORK` si elle
> manque, puis il y ajoute une page par fichier `memory/*.md`.
>
> La **clé de projet Jira** vaut le trigramme par défaut : corrige-la si ton projet Jira porte
> une autre clé. Le MCP résout en général le **site Atlassian** ; précise-le quand le compte
> donne accès à deux sites ou plus. Tant que la **page racine** vaut `à renseigner`,
> `@ailed-communication` **demande l'URL à l'humain**. Il peut aussi lister les espaces via le
> MCP. Puis il **réécrit la valeur ici**. La création n'a jamais lieu sur une cible devinée.
