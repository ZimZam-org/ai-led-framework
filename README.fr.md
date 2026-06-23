> 🌍 **Langue** : Français · [English](README.md)

# AI-Led — framework de workflow pour Claude Code

Template prêt à l'emploi qui transforme n'importe quel projet (nouveau ou existant) en
projet **piloté par agents IA**, avec :

- 🧠 une **mémoire persistante** (`memory/`) tenue à jour et utilisée comme source de vérité ;
- 🤖 **21 agents** préfixés `ailed-*` couvrant 4 workflows (Discovery, Feature, Incident, Security) ;
- 🛠️ **10 skills** réutilisables pour les tâches récurrentes (tableau de bord status, ADR, git-flow, quality-gate, design-system…).

Installation en une commande :

```bash
npx @s2bp/ai-led-framework init
```

## Ce que `init` installe

| Dossier             | Contenu                                                        |
| ------------------- | -------------------------------------------------------------- |
| `.claude/agents/`   | 21 agents `ailed-*.md` (invocables via `@ailed-<nom>`)         |
| `.claude/skills/`   | 10 skills `ailed-*` (invocables via `/ailed-<nom>`)            |
| `.claude/commands/` | slash-command `/ailed-bootstrap` (amorçage du framework)       |
| `memory/`           | 15 fichiers de mémoire projet (dont `config.md`, `process.md`, `conventions.md` et `market-watch.md`), dans la langue choisie |
| `CLAUDE.md`         | pointeur framework (créé seulement s'il n'existe pas)          |

Les fichiers existants ne sont **jamais écrasés** sauf avec `--force`.

## Configuration (`memory/config.md`)

`init` génère `memory/config.md`, **source de vérité de l'outillage** que les agents lisent
avant d'agir. Deux choses y sont paramétrées :

### Langue des fichiers `memory/`

Les fichiers de mémoire sont installés dans la langue choisie, pour faciliter la relecture
humaine. **Français par défaut**, anglais disponible :

```bash
npx @s2bp/ai-led-framework init --lang=en
```

Seuls les fichiers `memory/` sont traduits ; les agents/skills restent en français. La valeur
sentinelle d'une intégration désactivée suit la langue (`aucun` en `fr`, `none` en `en`) et
reste cohérente entre `config.md` et les agents.

### Trigramme de ticket

Le préfixe des tickets de dev (ex. `ZZM-000001`) est un **trigramme dérivé du nom du projet**
(3 premières lettres du dossier), surchargeable :

```bash
npx @s2bp/ai-led-framework init --trigram=ZZM
```

### Intégrations (optionnelles)

Monitoring, tests E2E et génération promo sont **désactivés par défaut** (`aucun`). Tant qu'une
intégration vaut `aucun`, l'agent concerné signale le pré-requis manquant et s'arrête proprement
au lieu de supposer un outil. On les active à l'install ou plus tard en éditant `config.md` :

```bash
npx @s2bp/ai-led-framework init \
  --trigram=ZZM \
  --monitoring=Sentry \
  --e2e=Playwright \
  --promo=Remotion \
  --watch="MCP web search" \
  --seo-aso="Search Console + Ahrefs"
```

| Domaine                | Agent / skill concerné                                                  | Exemple d'outil       |
| ---------------------- | ----------------------------------------------------------------------- | --------------------- |
| Monitoring / logs      | `@ailed-check-log`                                                      | Sentry                |
| Tests end-to-end       | `@ailed-test`, `@ailed-dev`                                             | Playwright            |
| Génération promo       | `/ailed-promo`, `@ailed-communication`                                  | Remotion              |
| Veille concurrentielle | `@ailed-scout`, `@ailed-fact-check`, `@ailed-analyst`, `@ailed-monetization` | MCP web / URLs        |
| SEO / ASO              | `@ailed-seo-aso`                                                        | Search Console, Ahrefs, App Store Connect |

> `@ailed-monetization` utilise le canal **Veille** (pas d'intégration dédiée). `@ailed-seo-aso`
> dégrade vers la **Veille** en confiance basse si **SEO / ASO** est désactivé.

**Conventions techniques existantes (facultatif).** Si le projet possède déjà un document décrivant
ses conventions de code et son organisation technique, importe-le avec `--conventions=<chemin>` : son
contenu est copié tel quel dans `memory/conventions.md` (avec un en-tête `Source:`). `@ailed-architect`,
`@ailed-dev` et `@ailed-ux` le lisent avant d'agir. Sans le flag, un stub `TODO` est installé — le
fichier peut rester partiellement vide et être complété plus tard à la main ou via `@ailed-init-memory`.

### Options de `init`

```
--lang=fr|en        Langue des fichiers memory/ (défaut : fr)
--trigram=XYZ       Préfixe de ticket (défaut : 3 lettres du nom du dossier)
--monitoring=NOM    Outil de monitoring ou désactivé (défaut)
--e2e=NOM           Outil de tests E2E ou désactivé (défaut)
--promo=NOM         Outil de génération promo ou désactivé (défaut)
--watch=NOM         Canal de veille concurrentielle (MCP web / URLs) ou désactivé (défaut)
--seo-aso=NOM       Outil SEO / ASO (Search Console, Ahrefs, App Store Connect) ou désactivé (défaut)
--conventions=CHEMIN  Importe un fichier de conventions/organisation technique dans memory/conventions.md (facultatif)
-y, --yes           Mode non interactif (sinon, questions posées en terminal)
-f, --force         Écrase les fichiers existants
```

## Les agents (préfixe `@ailed-`)

| Agent                    | Rôle                                                      |
| ------------------------ | --------------------------------------------------------- |
| `@ailed-scout`           | Collecte de veille sourcée (concurrents, tendances)       |
| `@ailed-seo-aso`         | Audit SEO (web) / ASO (mobile) + benchmark concurrence    |
| `@ailed-monetization`    | Challenge la monétisation (en place/à venir/absente) vs concurrence |
| `@ailed-fact-check`      | Gate anti-hallucination de la veille                      |
| `@ailed-analyst`         | Veille → sujets candidats scorés                          |
| `@ailed-brainstorm`      | Besoin métier → SPEC challengée                           |
| `@ailed-ux`              | SPEC → 3 wireframes + maquette finale                     |
| `@ailed-pm`              | SPEC → EPICs + roadmap                                    |
| `@ailed-architect`       | Impacts techniques + ADR                                  |
| `@ailed-planner`         | EPICs → tickets atomiques `<TRIGRAMME>-*`                 |
| `@ailed-dev`             | Implémente un ticket (branche + MR, ne fusionne jamais)   |
| `@ailed-review`          | Revue de MR → `PASS` / `CHANGES REQUESTED`                |
| `@ailed-test`            | Tests E2E (nominal, limites, régressions)                 |
| `@ailed-communication`   | Changelog, features, release notes                        |
| `@ailed-release`         | Quality gates → tag → clôture                             |
| `@ailed-check-log`       | Surveillance logs/erreurs (24 h)                          |
| `@ailed-rca`             | Root Cause Analysis d'un incident                         |
| `@ailed-check-secu`      | Scan vulnérabilités (deps, code, config)                  |
| `@ailed-security-review` | Revue sécurité d'une MR (OWASP)                           |
| `@ailed-init-memory`     | Reconstruit la mémoire d'un projet existant               |
| `@ailed-knowledge-audit` | Mesure la complétude de la mémoire                        |

## Les skills (préfixe `/ailed-`)

`ailed-status`, `ailed-adr`, `ailed-architecture-map`, `ailed-git-flow`, `ailed-quality-gate`,
`ailed-release-flow`, `ailed-promo`, `ailed-design-system`, `ailed-wireframe`,
`ailed-mockup-preview`.

Les trois derniers enrichissent `@ailed-ux` (base de design partagée, 3 variantes de
wireframes, rendu + screenshots de la maquette). Ils s'appuient sur les skills Claude Code
natifs `frontend-design` et `chrome-devtools` quand ils sont présents dans l'environnement
cible, et dégradent proprement sinon.

## État du projet & tableau de bord

Deux façons complémentaires d'obtenir un instantané **en lecture seule** du projet (état,
roadmap, kanban, fonctionnalités, veille, process) :

- **`/ailed-status`** (dans Claude Code) — une **synthèse intelligente** de `memory/` qui
  remonte **ce qui demande une décision** (validations humaines en attente, sujets candidats
  à promouvoir, veille périmée, intégrations désactivées).
- **`ai-led status`** (CLI) — un snapshot terminal **déterministe et sans token**. Ajoute
  `--html` pour générer `ailed-status.html`, un tableau de bord **statique** (kanban en
  colonnes, tables, diagrammes du process) ouvrable dans le navigateur — **aucun serveur,
  aucune donnée envoyée** :

```bash
npx @s2bp/ai-led-framework status          # snapshot terminal
npx @s2bp/ai-led-framework status --html   # → ailed-status.html (à ouvrir au navigateur)
```

Le HTML charge `marked` + `mermaid` via CDN pour le rendu markdown et les diagrammes
(connexion internet nécessaire à l'affichage).

## Les 4 workflows (voir `memory/process.md`)

```
Discovery : (scout · seo-aso · monetization) → fact-check → analyst → (validation humaine) → brainstorm
Feature   : brainstorm → ux → pm → architect → planner → dev → review → test → communication → release
Incident  : check-log → rca → dev → review → test → communication
Security  : check-secu → security-review → dev → review → test → communication
```

Points de validation **humaine** obligatoires : après `analyst` (promotion d'un sujet),
après `brainstorm` (SPEC), après `ux` (maquette), avant `release` (tag).

### Workflow Discovery (veille concurrentielle)

Workflow **exploratoire** qui alimente `memory/market-watch.md` pour faire émerger de
nouveaux sujets, sans jamais créer de ticket ni écrire dans la roadmap :

1. **Activer la veille** : renseigne l'intégration `Veille` dans `memory/config.md`
   (un canal de veille : MCP de recherche web, ou liste curée d'URLs concurrents/flux).
   Tant qu'elle vaut `aucun`/`none`, les agents s'arrêtent proprement.
2. **Collecteurs spécialisés**, tous en *Observations brutes* (sourcées + datées) :
   - `@ailed-scout` : signaux marché/feature/concurrents ;
   - `@ailed-seo-aso` : découvrabilité — audit SEO (web) ou ASO (mobile) de notre produit + gaps vs concurrence ;
   - `@ailed-monetization` : modèle de monétisation en place/à venir/absent challengé vs concurrence (grilles de prix).
   Le détail (matrices de mots-clés, grilles tarifaires) va en section *Analyses spécialisées*.
3. `@ailed-fact-check` **vérifie/dégrade/rejette** chaque observation, quelle que soit son origine (gate anti-hallucination).
4. `@ailed-analyst` clusterise, **déduplique** contre `features.md`/`roadmap.md` et produit
   un **backlog de sujets candidats scorés** (Impact/Effort/Alignement).
5. **Validation humaine** : tu fais passer un sujet de `candidat` à `validé→brainstorm`.
   Il rejoint alors le workflow Feature via `@ailed-brainstorm`.

**Amélioration continue** : relance `(scout · seo-aso · monetization) → fact-check → analyst` sur une cadence (ex.
mensuelle, via `/loop` ou un agent planifié) pour rafraîchir la veille et proposer une
nouvelle shortlist. La **découverte** tourne en boucle ; la **promotion vers la roadmap et
le déploiement restent une décision humaine** — c'est le garde-fou du framework.

## Démarrage rapide

```bash
cd mon-projet
npx @s2bp/ai-led-framework init
```

Puis dans Claude Code, lance la slash-command **`/ailed-bootstrap`** (installée par `init`),
qui oriente automatiquement selon le contexte :

- **Projet existant** → `@ailed-init-memory` (reconstruit la mémoire) puis `@ailed-knowledge-audit`.
- **Nouveau projet** → `@ailed-brainstorm` pour cadrer la première SPEC.

## Développer le framework lui-même

```
templates/claude/agents/   # source des agents (placeholders {{TICKET_PREFIX}}, {{E2E}}…)
templates/claude/skills/   # source des skills
templates/claude/commands/ # source des slash-commands (/ailed-bootstrap)
templates/memory/fr/       # source de la mémoire en français (défaut)
templates/memory/en/       # source de la mémoire en anglais
                           # (ajoute un dossier de langue ici pour en proposer une nouvelle)
bin/ai-led.js              # CLI d'installation (Node, zéro dépendance)
```

Tester l'installation localement sans publier :

```bash
node bin/ai-led.js init --trigram=TST -y   # depuis un projet cible
# ou
npm link && ai-led init
```

## Licence

MIT.
