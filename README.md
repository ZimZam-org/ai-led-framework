> 🌍 **Language**: English · [Français](README.fr.md)

# AI-Led — workflow framework for Claude Code

A ready-to-use template that turns any project (new or existing) into an **AI-agent-driven**
project, with:

- 🧠 a **persistent memory** (`memory/`) kept up to date and used as the source of truth;
- 🤖 **21 agents** prefixed `ailed-*` covering 4 workflows (Discovery, Feature, Incident, Security);
- 🛠️ **9 reusable skills** for recurring tasks (ADR, git-flow, quality-gate, design-system…).

One-command install:

```bash
npx @s2bp/ai-led-framework init
```

## What `init` installs

| Folder              | Contents                                                       |
| ------------------- | -------------------------------------------------------------- |
| `.claude/agents/`   | 21 `ailed-*.md` agents (callable via `@ailed-<name>`)          |
| `.claude/skills/`   | 9 `ailed-*` skills (callable via `/ailed-<name>`)              |
| `.claude/commands/` | `/ailed-bootstrap` slash-command (framework bootstrap)         |
| `memory/`           | 14 project memory files (including `config.md`, `process.md` and `market-watch.md`), in the chosen language |
| `CLAUDE.md`         | framework pointer (created only if absent)                     |

Existing files are **never overwritten** unless you pass `--force`.

## Configuration (`memory/config.md`)

`init` generates `memory/config.md`, the **source of truth for tooling** that agents read
before acting. Two things are configured there:

### Language of the `memory/` files

Memory files are installed in the chosen language to ease human review. **French by default**,
English available:

```bash
npx @s2bp/ai-led-framework init --lang=en
```

Only the `memory/` files are translated; agents/skills stay in French. The sentinel value of a
disabled integration follows the language (`aucun` in `fr`, `none` in `en`) and stays consistent
between `config.md` and the agents.

### Ticket trigram

The dev ticket prefix (e.g. `SKP-000001`) is a **trigram derived from the project name**
(first 3 letters of the folder), overridable:

```bash
npx @s2bp/ai-led-framework init --trigram=SKP
```

### Integrations (optional)

Monitoring, E2E tests and promo generation are **disabled by default** (`none`). As long as an
integration is set to `none`, the matching agent flags the missing prerequisite and stops
cleanly instead of assuming a tool. Enable them at install time or later by editing `config.md`:

```bash
npx @s2bp/ai-led-framework init \
  --trigram=SKP \
  --monitoring=Sentry \
  --e2e=Playwright \
  --promo=Remotion \
  --watch="MCP web search" \
  --seo-aso="Search Console + Ahrefs"
```

| Area                  | Agent / skill involved                                                  | Example tool          |
| --------------------- | ----------------------------------------------------------------------- | --------------------- |
| Monitoring / logs     | `@ailed-check-log`                                                      | Sentry                |
| End-to-end tests      | `@ailed-test`, `@ailed-dev`                                             | Playwright            |
| Promo generation      | `/ailed-promo`, `@ailed-communication`                                  | Remotion              |
| Market watch          | `@ailed-scout`, `@ailed-fact-check`, `@ailed-analyst`, `@ailed-monetization` | MCP web / URLs        |
| SEO / ASO             | `@ailed-seo-aso`                                                        | Search Console, Ahrefs, App Store Connect |

> `@ailed-monetization` uses the **Watch** channel (no dedicated integration). `@ailed-seo-aso`
> degrades to **Watch** at low confidence when **SEO / ASO** is disabled.

### `init` options

```
--lang=fr|en        Language of the memory/ files (default: fr)
--trigram=XYZ       Ticket prefix (default: 3 letters of the folder name)
--monitoring=NAME   Monitoring tool, or disabled (default)
--e2e=NAME          E2E testing tool, or disabled (default)
--promo=NAME        Promo generation tool, or disabled (default)
--watch=NAME        Market-watch channel (web search MCP / URLs), or disabled (default)
--seo-aso=NAME      SEO / ASO tool (Search Console, Ahrefs, App Store Connect), or disabled (default)
-y, --yes           Non-interactive mode (otherwise questions are asked in the terminal)
-f, --force         Overwrite existing files
```

## The agents (prefix `@ailed-`)

| Agent                    | Role                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `@ailed-scout`           | Sourced market-watch collection (competitors, trends)      |
| `@ailed-seo-aso`         | SEO (web) / ASO (mobile) audit + competitor benchmark      |
| `@ailed-monetization`    | Challenges monetization (current/upcoming/absent) vs competitors |
| `@ailed-fact-check`      | Anti-hallucination gate for the watch                      |
| `@ailed-analyst`         | Watch → scored candidate topics                            |
| `@ailed-brainstorm`      | Business need → challenged SPEC                            |
| `@ailed-ux`              | SPEC → 3 wireframes + final mockup                         |
| `@ailed-pm`              | SPEC → EPICs + roadmap                                     |
| `@ailed-architect`       | Technical impacts + ADR                                    |
| `@ailed-planner`         | EPICs → atomic tickets `<TRIGRAM>-*`                       |
| `@ailed-dev`             | Implements a ticket (branch + MR, never merges)            |
| `@ailed-review`          | MR review → `PASS` / `CHANGES REQUESTED`                   |
| `@ailed-test`            | E2E tests (nominal, edge cases, regressions)               |
| `@ailed-communication`   | Changelog, features, release notes                         |
| `@ailed-release`         | Quality gates → tag → close-out                            |
| `@ailed-check-log`       | Logs/errors monitoring (24 h)                              |
| `@ailed-rca`             | Root Cause Analysis of an incident                         |
| `@ailed-check-secu`      | Vulnerability scan (deps, code, config)                    |
| `@ailed-security-review` | Security review of an MR (OWASP)                           |
| `@ailed-init-memory`     | Rebuilds the memory of an existing project                 |
| `@ailed-knowledge-audit` | Measures memory completeness                               |

## The skills (prefix `/ailed-`)

`ailed-adr`, `ailed-architecture-map`, `ailed-git-flow`, `ailed-quality-gate`,
`ailed-release-flow`, `ailed-promo`, `ailed-design-system`, `ailed-wireframe`,
`ailed-mockup-preview`.

The last three enrich `@ailed-ux` (shared design baseline, 3 wireframe variants, mockup render
+ screenshots). They rely on the native Claude Code skills `frontend-design` and
`chrome-devtools` when present in the target environment, and degrade gracefully otherwise.

## The 4 workflows (see `memory/process.md`)

```
Discovery : (scout · seo-aso · monetization) → fact-check → analyst → (human validation) → brainstorm
Feature   : brainstorm → ux → pm → architect → planner → dev → review → test → communication → release
Incident  : check-log → rca → dev → review → test → communication
Security  : check-secu → security-review → dev → review → test → communication
```

Mandatory **human** validation points: after `analyst` (promoting a topic), after `brainstorm`
(SPEC), after `ux` (mockup), before `release` (tag).

### Discovery workflow (competitive intelligence)

An **exploratory** workflow that feeds `memory/market-watch.md` to surface new topics, without
ever creating a ticket or writing to the roadmap:

1. **Enable the watch**: set the `Watch` integration in `memory/config.md` (a watch channel:
   web search MCP, or a curated list of competitor URLs/feeds). While it is `aucun`/`none`,
   the agents stop cleanly.
2. **Specialist collectors**, all writing to *Raw observations* (sourced + dated):
   - `@ailed-scout`: market/feature/competitor signals;
   - `@ailed-seo-aso`: discoverability — SEO (web) or ASO (mobile) audit of our product + gaps vs competitors;
   - `@ailed-monetization`: current/upcoming/absent monetization model challenged vs competitors (pricing grids).
   The detail (keyword matrices, pricing grids) goes into the *Specialised analyses* section.
3. `@ailed-fact-check` **verifies/downgrades/rejects** each observation, whatever its origin (anti-hallucination gate).
4. `@ailed-analyst` clusters, **deduplicates** against `features.md`/`roadmap.md` and produces a
   **scored candidate topics backlog** (Impact/Effort/Alignment).
5. **Human validation**: you move a topic from `candidate` to `validated→brainstorm`. It then
   joins the Feature workflow via `@ailed-brainstorm`.

**Continuous improvement**: re-run `(scout · seo-aso · monetization) → fact-check → analyst` on a
cadence (e.g. monthly, via `/loop` or a scheduled agent) to refresh the watch and propose a new
shortlist. **Discovery** runs in a loop; **promotion to the roadmap and deployment remain a human
decision** — that is the framework's safeguard.

## Quick start

```bash
cd my-project
npx @s2bp/ai-led-framework init
```

Then in Claude Code, run the **`/ailed-bootstrap`** slash-command (installed by `init`), which
routes automatically based on context:

- **Existing project** → `@ailed-init-memory` (rebuilds the memory) then `@ailed-knowledge-audit`.
- **New project** → `@ailed-brainstorm` to frame the first SPEC.

## Developing the framework itself

```
templates/claude/agents/   # agent sources (placeholders {{TICKET_PREFIX}}, {{E2E}}…)
templates/claude/skills/   # skill sources
templates/claude/commands/ # slash-command sources (/ailed-bootstrap)
templates/memory/fr/       # French memory source (default)
templates/memory/en/       # English memory source
                           # (add a language folder here to offer a new one)
bin/ai-led.js              # install CLI (Node, zero dependencies)
```

Test the install locally without publishing:

```bash
node bin/ai-led.js init --trigram=TST -y   # from a target project
# or
npm link && ai-led init
```

## License

MIT.
