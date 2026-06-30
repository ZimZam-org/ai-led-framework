# Configuration AI-Led

Last Updated: {{DATE}}

Source de vérité des choix d'outillage du projet. Renseigné par `npx @s2bp/ai-led-framework init`,
modifiable à la main à tout moment. **Les agents lisent ce fichier avant d'agir** et
adaptent leur comportement (notamment si une intégration vaut `{{DISABLED}}`).

## Identité

- Trigramme projet (préfixe de ticket) : `{{TICKET_PREFIX}}`
  → les tickets de dev sont nommés `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, …

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

## Conventions techniques (facultatif)

Les conventions de code et l'organisation technique **en place** sont décrites dans
`memory/conventions.md`. Renseignable à l'install (`--conventions=<chemin>`, import brut)
ou complété à la main / via `@ailed-init-memory`. **Lu par `@ailed-architect`, `@ailed-dev`
et `@ailed-ux`** avant d'agir. Le fichier peut rester partiellement vide.

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

> Valeurs possibles : un nom d'outil (ex. `Sentry`, `Playwright`, `Remotion`, `Jira`, `Confluence`) ou `{{DISABLED}}`.
> Si une intégration vaut `{{DISABLED}}`, l'agent correspondant **signale le pré-requis manquant
> et s'arrête proprement** au lieu de supposer un outil. Pour activer une intégration plus
> tard, remplace `{{DISABLED}}` par le nom de l'outil ici et configure le MCP/pipeline associé.
>
> Cas particuliers de la veille : `@ailed-monetization` s'appuie sur le canal **Veille**
> (pas d'intégration dédiée). `@ailed-seo-aso`, lui, **dégrade** vers la **Veille** en confiance
> basse si **SEO / ASO** vaut `{{DISABLED}}`, et ne s'arrête que si la **Veille** l'est aussi.

### Ticketing & documentation externes (Jira / Confluence via MCP)

Principe **miroir** : la `memory/` reste la **source de vérité locale** (hors-ligne, versionnée
git, lue par `ai-led status`). Quand le **Ticketing externe** (ex. `Jira`) ou la **Documentation
externe** (ex. `Confluence`) est activé, les agents **synchronisent en plus** vers l'outil via son
MCP — ils ne remplacent jamais la `memory/`.

- **Pré-requis** : le MCP correspondant (ex. MCP Atlassian, qui couvre Jira **et** Confluence) doit
  être connecté dans le Claude Code du projet. Sinon l'agent signale le pré-requis manquant et
  reste en mode fichier-local.
- **Convention d'ID** : quand le **Ticketing externe** est actif, l'**ID de ticket est la clé de
  l'outil** (ex. `{{TICKET_PREFIX}}-123`), le trigramme `{{TICKET_PREFIX}}` servant de **clé de
  projet**. Le format zéro-padded `{{TICKET_PREFIX}}-000001` n'est la convention que du mode
  fichier-local (Ticketing = `{{DISABLED}}`).
- **Sens de synchro (Jira)** : un ticket créé par `@ailed-planner` est poussé vers Jira (type
  *feature*) ; un ticket qui **existe déjà** dans Jira est tiré par `@ailed-dev` et reflété dans
  `memory/kanban.md`. Les **incidents** (`@ailed-check-log`) et **vulnérabilités CRITICAL/HIGH**
  (`@ailed-check-secu`) créent des issues de type *bug* ; `@ailed-rca` enrichit le bug lié avec son
  analyse (cause, impact, reproduction, correction, prévention).
- **Miroir Confluence** : `@ailed-communication` maintient, sous une **sous-page conteneur
  `AI LED FRAMEWORK`** créée sous la **page racine** (l'URL fournie ci-dessous), **une page par
  fichier `memory/*.md`** (titre de page = titre du fichier). La `memory/` reste la source de
  vérité ; ces pages en sont le miroir lisible/partageable.

**Coordonnées des outils** (lues par les agents avant toute création) :

| Outil      | Champ                                        | Valeur             |
| ---------- | -------------------------------------------- | ------------------ |
| Atlassian  | Site (cloud), si plusieurs connectés         | `à renseigner`     |
| Jira       | Clé de projet (où créer les tickets)         | `{{TICKET_PREFIX}}` |
| Jira       | Type d'issue — feature (`@ailed-planner`)    | `Task`             |
| Jira       | Type d'issue — bug (incident / sécurité)     | `Bug`              |
| Confluence | Page racine (URL de la page parente)         | `à renseigner`     |
| Confluence | Sous-page conteneur (créée si absente)       | `AI LED FRAMEWORK` |

> Exemple de **page racine** : `https://skeepers.atlassian.net/wiki/spaces/RDP/pages/2883387645/Feedback+Management`.
> Le MCP en déduit l'espace et la page parente ; la sous-page `AI LED FRAMEWORK` y est créée si
> absente, puis peuplée d'une page par fichier `memory/*.md`.
>
> La **clé de projet Jira** vaut le trigramme par défaut — corrige-la si ton projet Jira a une
> autre clé. Le **site Atlassian** est en général résolu par le MCP ; précise-le si plusieurs
> sites sont connectés. Tant que la **page racine** vaut `à renseigner`, `@ailed-communication`
> **demande l'URL à l'humain (ou la liste des espaces via le MCP), puis réécrit la valeur ici** —
> la création n'a jamais lieu sur une cible devinée.
