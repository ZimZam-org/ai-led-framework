# AI-Led — framework de workflow pour Claude Code

Template prêt à l'emploi qui transforme n'importe quel projet (nouveau ou existant) en
projet **piloté par agents IA**, avec :

- 🧠 une **mémoire persistante** (`memory/`) tenue à jour et utilisée comme source de vérité ;
- 🤖 **16 agents** préfixés `ailed-*` couvrant 3 workflows (Feature, Incident, Security) ;
- 🛠️ **6 skills** réutilisables pour les tâches récurrentes (ADR, git-flow, quality-gate…).

Installation en une commande :

```bash
npx @s2bp/ai-led init
```

## Ce que `init` installe

| Dossier             | Contenu                                                        |
| ------------------- | -------------------------------------------------------------- |
| `.claude/agents/`   | 16 agents `ailed-*.md` (invocables via `@ailed-<nom>`)         |
| `.claude/skills/`   | 6 skills `ailed-*` (invocables via `/ailed-<nom>`)             |
| `.claude/commands/` | slash-command `/ailed-bootstrap` (amorçage du framework)       |
| `memory/`           | 13 fichiers de mémoire projet (dont `config.md` et `process.md`), dans la langue choisie |
| `CLAUDE.md`         | pointeur framework (créé seulement s'il n'existe pas)          |

Les fichiers existants ne sont **jamais écrasés** sauf avec `--force`.

## Configuration (`memory/config.md`)

`init` génère `memory/config.md`, **source de vérité de l'outillage** que les agents lisent
avant d'agir. Deux choses y sont paramétrées :

### Langue des fichiers `memory/`

Les fichiers de mémoire sont installés dans la langue choisie, pour faciliter la relecture
humaine. **Français par défaut**, anglais disponible :

```bash
npx @s2bp/ai-led init --lang=en
```

Seuls les fichiers `memory/` sont traduits ; les agents/skills restent en français. La valeur
sentinelle d'une intégration désactivée suit la langue (`aucun` en `fr`, `none` en `en`) et
reste cohérente entre `config.md` et les agents.

### Trigramme de ticket

Le préfixe des tickets de dev (ex. `SKP-000001`) est un **trigramme dérivé du nom du projet**
(3 premières lettres du dossier), surchargeable :

```bash
npx @s2bp/ai-led init --trigram=SKP
```

### Intégrations (optionnelles)

Monitoring, tests E2E et génération promo sont **désactivés par défaut** (`aucun`). Tant qu'une
intégration vaut `aucun`, l'agent concerné signale le pré-requis manquant et s'arrête proprement
au lieu de supposer un outil. On les active à l'install ou plus tard en éditant `config.md` :

```bash
npx @s2bp/ai-led init \
  --trigram=SKP \
  --monitoring=Sentry \
  --e2e=Playwright \
  --promo=Remotion
```

| Domaine            | Agent / skill concerné                 | Exemple d'outil |
| ------------------ | -------------------------------------- | --------------- |
| Monitoring / logs  | `@ailed-check-log`                     | Sentry          |
| Tests end-to-end   | `@ailed-test`, `@ailed-dev`            | Playwright      |
| Génération promo   | `/ailed-promo`, `@ailed-communication` | Remotion        |

### Options de `init`

```
--lang=fr|en        Langue des fichiers memory/ (défaut : fr)
--trigram=XYZ       Préfixe de ticket (défaut : 3 lettres du nom du dossier)
--monitoring=NOM    Outil de monitoring ou désactivé (défaut)
--e2e=NOM           Outil de tests E2E ou désactivé (défaut)
--promo=NOM         Outil de génération promo ou désactivé (défaut)
-y, --yes           Mode non interactif (sinon, questions posées en terminal)
-f, --force         Écrase les fichiers existants
```

## Les agents (préfixe `@ailed-`)

| Agent                    | Rôle                                                      |
| ------------------------ | --------------------------------------------------------- |
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

`ailed-adr`, `ailed-architecture-map`, `ailed-git-flow`, `ailed-quality-gate`,
`ailed-release-flow`, `ailed-promo`.

## Les 3 workflows (voir `memory/process.md`)

```
Feature   : brainstorm → ux → pm → architect → planner → dev → review → test → communication → release
Incident  : check-log → rca → dev → review → test → communication
Security  : check-secu → security-review → dev → review → test → communication
```

Points de validation **humaine** obligatoires : après `brainstorm` (SPEC), après `ux`
(maquette), avant `release` (tag).

## Démarrage rapide

```bash
cd mon-projet
npx @s2bp/ai-led init
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
