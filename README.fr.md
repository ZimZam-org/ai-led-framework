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
| `.claude/hooks/`    | `ailed-runtime-hook.js` + hooks `Task` dans `settings.json` qui alimentent le panneau de progression (`watch`/`dashboard`) |
| `memory/`           | 15 fichiers de mémoire projet (dont `config.md`, `process.md`, `conventions.md` et `market-watch.md`), dans la langue choisie |
| `CLAUDE.md`         | pointeur framework (créé seulement s'il n'existe pas)          |

Les fichiers existants ne sont **jamais écrasés** sauf avec `--force` (les hooks de `settings.json`
sont fusionnés sans rien casser, et `.ailed/` est ajouté au `.gitignore`).

## Configuration (`memory/config.md`)

`init` génère `memory/config.md`, **source de vérité de l'outillage** que les agents lisent
avant d'agir. On y paramètre la langue, le trigramme, le style de sortie et les intégrations :

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

### Style de sortie

Le **niveau de verbosité** des agents et des rapports — `concis` · `standard` (défaut) · `détaillé`.
Ce réglage pilote *uniquement la présentation* (affichage dans Claude Code, synthèses
`/ailed-status`, texte poussé vers Jira/Confluence) ; la `memory/` reste toujours **complète et
versionnée** quel que soit le choix.

```bash
npx @s2bp/ai-led-framework init --style=concis
```

- `concis` — mode « à l'essentiel » : pas de préambule ni de reformulation, puces courtes, tableaux
  plutôt que prose, et sur Jira titre + critères d'acceptation en puces. Ne masque **jamais** un
  risque, une décision ou un blocage — on coupe le superflu, pas le fond.
- `standard` — synthèse claire et structurée (défaut).
- `détaillé` — explications complètes : raisonnement, alternatives écartées, contexte étendu.

Modifiable à tout moment dans `memory/config.md`, ou forcé le temps d'un run :
`ai-led status --style=détaillé`.

### Modèle LLM par agent (économie de tokens)

Chacun des 21 agents tourne sur un **modèle choisi selon sa fonction**, pour que les agents
simples ne consomment pas de tokens premium :

- `opus` — raisonnement / jugement / revue critique, là où une mauvaise sortie coûte du rework
  (`brainstorm`, `architect`, `planner`, `pm`, `analyst`, `review`, `security-review`, `rca`) ;
- `sonnet` — exécution standard performante et volumineuse (`dev`, `ux`, `test`, `communication`,
  `release`, `fact-check`, `check-secu`, `seo-aso`, `monetization`, `knowledge-audit`, `init-memory`) ;
- `haiku` — collecte / extraction mécanique (`scout`, `check-log`).

Le mapping vit dans la **table « Modèles LLM par agent » de `memory/config.md`** (source de vérité).
Le harness lit le modèle dans le frontmatter de chaque agent : après avoir édité la table,
applique-la :

```bash
npx @s2bp/ai-led-framework models        # affiche le mapping effectif
npx @s2bp/ai-led-framework models sync    # applique la table à .claude/agents/*.md
```

Tu peux aussi fixer un modèle à l'install : `init --model-dev=opus --model-scout=sonnet`
(tier : `opus` · `sonnet` · `haiku` · `inherit`). `update` réapplique ce que dit la table.

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
  --seo-aso="Search Console + Ahrefs" \
  --ticketing=Jira \
  --docs=Confluence
```

| Domaine                | Agent / skill concerné                                                  | Exemple d'outil       |
| ---------------------- | ----------------------------------------------------------------------- | --------------------- |
| Monitoring / logs      | `@ailed-check-log`                                                      | Sentry                |
| Tests end-to-end       | `@ailed-test`, `@ailed-dev`                                             | Playwright            |
| Génération promo       | `/ailed-promo`, `@ailed-communication`                                  | Remotion              |
| Veille concurrentielle | `@ailed-scout`, `@ailed-fact-check`, `@ailed-analyst`, `@ailed-monetization` | MCP web / URLs        |
| SEO / ASO              | `@ailed-seo-aso`                                                        | Search Console, Ahrefs, App Store Connect |
| Ticketing externe      | `@ailed-pm`, `@ailed-planner`, `@ailed-dev`                            | Jira (MCP Atlassian)  |
| Documentation externe  | `@ailed-communication`                                                 | Confluence (MCP Atlassian) |

> `@ailed-monetization` utilise le canal **Veille** (pas d'intégration dédiée). `@ailed-seo-aso`
> dégrade vers la **Veille** en confiance basse si **SEO / ASO** est désactivé.
>
> **Ticketing / Documentation externes** — principe **miroir** : la `memory/` reste la source de
> vérité locale ; quand `Jira`/`Confluence` est activé, les agents **synchronisent en plus** vers
> l'outil via son MCP (un seul **MCP Atlassian** couvre Jira **et** Confluence). Pré-requis : ce
> MCP doit être connecté dans le Claude Code du projet, sinon les agents restent en mode
> fichier-local. Quand le Ticketing externe est actif, l'**ID de ticket est la clé Jira**
> (ex. `ZZM-123`, le trigramme servant de clé de projet) ; le format `ZZM-000001` n'est la
> convention que du mode fichier-local.
>
> **Où sont créés tickets & doc ?** Tout est dans `memory/config.md` (section *Coordonnées des
> outils*). Côté **Jira** : clé de projet = trigramme par défaut, type *Task* pour les features
> (`@ailed-planner`) et *Bug* pour les incidents (`@ailed-check-log`) et vulnérabilités
> CRITICAL/HIGH (`@ailed-check-secu`). Côté **Confluence** : on fournit
> une **unique URL de page racine** ; `@ailed-communication` y crée (si absente) une sous-page
> **`AI LED FRAMEWORK`** et y maintient **une page par fichier `memory/*.md`** (miroir, sens unique
> `memory/` → Confluence). Tant qu'une coordonnée manque, l'agent **demande la valeur (ou la liste
> via le MCP), puis la réécrit dans `config.md`** — jamais de création sur une cible devinée. Voir
> les exemples ci-dessous.

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
--ticketing=NOM     Ticketing externe (ex. Jira, via MCP) ou désactivé (défaut)
--docs=NOM          Documentation externe (ex. Confluence, via MCP) ou désactivé (défaut)
--style=NIVEAU      Style de sortie agents/rapports : concis | standard | détaillé (défaut : standard)
--conventions=CHEMIN  Importe un fichier de conventions/organisation technique dans memory/conventions.md (facultatif)
-y, --yes           Mode non interactif (sinon, questions posées en terminal)
-f, --force         Écrase les fichiers existants
```

## Mettre à jour un projet existant

Quand un projet utilise déjà une **version antérieure** du framework, passe-le à la dernière avec :

```bash
npx @s2bp/ai-led-framework@latest update
```

`update` est le pendant sûr d'`init` pour les projets déjà embarqués :

| Cible                                                       | Comportement d'`update`                             |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `.claude/agents/`, `.claude/skills/`, `.claude/commands/`  | **toujours réécrits** dans la nouvelle version      |
| `memory/config.md`, `memory/process.md` (fichiers cadre)   | **fusion additive de sections** : les sections que le template a gagnées sont ajoutées ; tes sections existantes ne sont **jamais** touchées |
| `memory/*.md` (données projet) **jamais éditées**          | **réécrites proprement** dans la nouvelle version (détecté via `.ailed/manifest.json`) |
| `memory/*.md` (données projet) **éditées**                 | **préservées** telles quelles                        |
| Nouveaux fichiers `memory/`                                | **ajoutés**                                          |
| `CLAUDE.md`                                                 | **laissé intact**                                  |

La config (trigramme, intégrations, langue) est **relue depuis `memory/config.md`** : les
placeholders `{{TICKET_PREFIX}}`, `{{MONITORING}}`, … sont donc réappliqués correctement — pas
besoin de repasser les flags d'`init`. Tes propres agents/skills/commands non `ailed-` ne sont pas
touchés.

> **Comment `update` sait ce que tu as édité ?** `init`/`update` enregistrent l'empreinte de chaque
> fichier `memory/` posé dans `.ailed/manifest.json` (gitignoré, local). Au prochain `update`, un
> fichier dont l'empreinte n'a pas bougé est réputé *vierge* → réécrit proprement ; sinon il est
> préservé (données) ou fusionné section par section (fichiers cadre `config.md`/`process.md`). Les
> sections présentes des deux côtés mais **divergentes** sont signalées, jamais écrasées. Un
> `conventions.md` importé via `--conventions=` est exclu du manifeste : jamais réputé vierge, donc
> jamais écrasé.

> **Pourquoi `@latest` ?** `npx` réutilise une copie en cache du package ; le tag `@latest` force la
> récupération de la dernière version publiée au lieu de relancer celle déjà en cache.
>
> **Limite :** un agent ou skill **supprimé ou renommé** dans une version plus récente n'est *pas*
> auto-supprimé (au risque sinon d'effacer tes propres fichiers). Pour repartir d'un arbre framework
> propre, supprime d'abord uniquement les dossiers du framework, puis relance update :
>
> ```bash
> rm -rf .claude/agents .claude/skills .claude/commands
> npx @s2bp/ai-led-framework@latest update
> ```
>
> `memory/` et `CLAUDE.md` restent à l'abri — ils sont hors des dossiers supprimés.

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
| `@ailed-architect`       | Impacts techniques + ADR · DDD & cibles déployables       |
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
- **`ai-led status`** (CLI) — un snapshot terminal **déterministe et sans token** : barre
  d'avancement, compteurs kanban et liste « À surveiller ». Ajoute `--html` pour générer
  `ailed-status.html`, un tableau de bord **statique** qui ouvre sur une **synthèse visuelle** :
  deux **camemberts** (avancement global + jalon en cours, approximatif), trois compteurs d'action
  (**bugs** à traiter, **vulnérabilités** ouvertes, **arbitrages produit** discovery → roadmap),
  une **timeline chronologique des EPICs** et le **détail de l'EPIC en cours** (tâches terminées /
  en cours / à venir) ; le détail brut de chaque fichier `memory/` reste accessible, **replié** en
  bas de page — **aucun serveur, aucune donnée projet envoyée** :

```bash
npx @s2bp/ai-led-framework status          # snapshot terminal
npx @s2bp/ai-led-framework status --html   # → ailed-status.html (à ouvrir au navigateur)
```

Les deux respectent le **Style de sortie** de `config.md` (`concis` resserre la sortie, `détaillé`
ajoute jalons et tickets en cours et déplie les accordéons HTML) ; `--style=…` le force pour un run.
Le HTML charge `marked` + `mermaid` via CDN pour le rendu markdown et les diagrammes des
accordéons (connexion internet nécessaire à l'affichage).

## Panneau de progression en direct (`watch` / `dashboard`)

Pour **suivre l'avancement pendant une session Claude Code** — quelle epic / tâche est en cours,
quel agent vient de finir, travaille, ou va travailler — sans relancer `status`, le framework
fournit un **panneau vertical** rafraîchi en continu :

```bash
npx @s2bp/ai-led-framework watch        # le panneau seul (à mettre dans un terminal à gauche)
npx @s2bp/ai-led-framework dashboard    # split tmux/zellij : panneau à gauche · claude à droite
```

Le panneau affiche, de haut en bas, exactement la hiérarchie demandée :

```
AI-LED · progress
────────────────────────────
✓ EPIC-1  Fondations          ← dernière epic traitée
▶ EPIC-2  Paiement            ← epic en cours
  ✓ ZZM-000011 Modèle paiement  ← dernière tâche traitée
  ▶ ZZM-000012 Tunnel checkout  ← tâche en cours
    ✓ @architect (fini)         ← dernier agent
    ▶ @dev  impl checkout       ← agent en cours
    · @review                   ← agents à venir (chaîne du workflow)
    · @test
    · @communication
  · ZZM-000013 Remboursement    ← tâches suivantes
  · ZZM-000014 Webhooks
· EPIC-3  Reporting           ← epic suivante

2/6 tickets DONE · feature
```

> ⚠️ **Pourquoi un panneau séparé et pas une zone figée *dans* la fenêtre Claude Code ?**
> Claude Code est une TUI fermée dont on ne contrôle pas le rendu : on ne peut pas y injecter une
> colonne figée. La vraie colonne verticale figée à gauche s'obtient donc par un **split de
> terminal** (tmux ou zellij), Claude Code occupant la zone de droite — d'où `dashboard`.

**Source des données :**

- **Epics / tâches** : lus dans `memory/epics.md` et `memory/kanban.md` (statuts `DONE`,
  `IN_PROGRESS`, `TODO`…). Fonctionne même sans hook.
- **Agents (dernier / en cours / à venir)** : alimentés par le hook
  `.claude/hooks/ailed-runtime-hook.js` (installé par `init`/`update`), câblé via
  `.claude/settings.json` (`PostToolUse` sur `Task`). À chaque appel d'un sous-agent, il écrit
  l'agent actif dans `.ailed/runtime.json` (gitignoré) ; l'agent en cours affiche un **chrono en
  direct** (`▶ @dev impl · 2m14s`) pour que le panneau respire même pendant un long run. Les
  **agents à venir** sont projetés depuis la chaîne du workflow détecté (Discovery / Feature /
  Incident / Security, voir `memory/process.md`).
- **Battement de cœur de la boucle principale** : `PreToolUse` (matcher `*`) enregistre le dernier
  outil touché par la boucle principale, affiché en `⋯ Edit · 3s` quand aucun sous-agent ne tourne —
  le panneau reste vivant même en travail direct, pas seulement aux frontières d'agents. (Ce hook se
  déclenche à chaque appel d'outil ; retire l'entrée `PreToolUse` `*` de `.claude/settings.json`
  pour le désactiver.)

> **Tilix / GNOME Terminal (VTE) :** le rafraîchissement purge aussi le scrollback (`\x1b[3J`) à
> chaque redraw — le panneau live n'empile plus de frames périmées dans l'historique de défilement.

**Options :** `--width=N` (largeur du panneau), `--once` (affiche une fois puis quitte),
`dashboard --cmd="…"` (commande lancée à droite du split, défaut `claude`). Un layout zellij
est généré dans `.ailed/dashboard.kdl`.

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

## Exemples concrets : Jira & Confluence sur un projet existant

Pré-requis commun : le **MCP Atlassian** (couvre Jira **et** Confluence) est connecté dans le
Claude Code du projet. La `memory/` reste la source de vérité locale ; Jira/Confluence en sont
le miroir partageable.

### Exemple 1 — D'un besoin à un ticket Jira (workflow Feature)

```bash
cd mon-projet-existant
npx @s2bp/ai-led-framework init --trigram=ZZM --ticketing=Jira --docs=Confluence
```

Puis dans Claude Code :

1. `/ailed-bootstrap` → comme le projet existe déjà, il enchaîne `@ailed-init-memory` puis
   `@ailed-knowledge-audit` pour reconstruire la mémoire à partir du code.
2. `@ailed-brainstorm` : tu décris le besoin (« permettre l'export PDF des rapports »). L'agent
   produit une **SPEC challengée**. **→ validation humaine de la SPEC.**
3. `@ailed-pm` transforme la SPEC en **EPICs** (et crée/maj les EPICs côté Jira via le MCP),
   `@ailed-architect` trace les ADR dans `memory/decisions.md` (reflétés plus tard sur Confluence
   par le miroir de `@ailed-communication`). La clé de projet Jira vaut déjà `ZZM` — aucune autre
   coordonnée n'est requise à ce stade.
4. `@ailed-planner` découpe l'EPIC en **tickets atomiques**. Pour chaque ticket : écriture dans
   `memory/kanban.md` **puis création de l'issue Jira** via le MCP. L'issue revient avec sa clé
   `ZZM-123`, qui devient l'ID du ticket reflété dans `memory/kanban.md`.

Résultat : un ticket Jira `ZZM-123` créé, tracé localement, rattaché à son EPIC et à la SPEC.

### Exemple 2 — Développer un ticket Jira existant

```bash
cd mon-projet-existant
npx @s2bp/ai-led-framework init --trigram=ZZM --ticketing=Jira --docs=Confluence
```

Puis dans Claude Code :

1. `/ailed-bootstrap` (reconstruit la mémoire si ce n'est pas déjà fait).
2. `@ailed-dev ZZM-123` : l'issue **existe déjà dans Jira** (créée par une autre équipe par
   exemple). L'agent la **tire via le MCP** (titre, description, critères d'acceptation) et la
   **reflète dans `memory/kanban.md`** si absente. Il passe l'issue `TODO → IN_PROGRESS`, crée
   la branche `feat/ZZM-123-...`, développe, ouvre la **MR** (jamais de merge), lie l'URL de la
   MR à l'issue et la passe `TO_TEST`.
3. `@ailed-review` puis `@ailed-test` valident la MR ; `@ailed-communication` met à jour le
   changelog local **et synchronise le miroir Confluence** : sous-page `AI LED FRAMEWORK` (créée
   si absente sous la page racine), une page par fichier `memory/*.md`. Au **premier** passage,
   comme la page racine vaut `à renseigner`, l'agent te demande l'**URL Confluence** (ex.
   `…/wiki/spaces/RDP/pages/2883387645/Feedback+Management`) et l'enregistre dans `config.md`.

> Si le MCP Atlassian n'est **pas** connecté, chaque agent le signale et **continue en mode
> fichier-local** : aucun blocage, juste pas de synchro externe.

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
