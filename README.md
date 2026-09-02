> 🌍 **Language**: English · [Français](README.fr.md)

# AI-Led — workflow framework for Claude Code

A ready-to-use template that turns any project (new or existing) into an **AI-agent-driven**
project, with:

- 🧠 a **persistent memory** (`memory/`) kept up to date and used as the source of truth;
- 🤖 **21 agents** prefixed `ailed-*` covering 4 workflows (Discovery, Feature, Incident, Security);
- 🛠️ **11 reusable skills** for recurring tasks (status dashboard, ADR, git-flow, quality-gate, design-system, screen contact sheet…).

One-command install:

```bash
npx @s2bp/ai-led-framework init
```

## What `init` installs

| Folder              | Contents                                                       |
| ------------------- | -------------------------------------------------------------- |
| `.claude/agents/`   | 21 `ailed-*.md` agents (callable via `@ailed-<name>`)          |
| `.claude/skills/`   | 11 `ailed-*` skills (callable via `/ailed-<name>`)             |
| `.claude/commands/` | `/ailed-bootstrap` slash-command (framework bootstrap)         |
| `.claude/hooks/`    | `ailed-runtime-hook.js` + `Task` hooks in `settings.json` feeding the live progress sidebar (`watch`/`dashboard`) |
| `memory/`           | 15 project memory files (including `config.md`, `process.md`, `conventions.md` and `market-watch.md`), in the chosen language |
| `CLAUDE.md`         | framework pointer (created only if absent)                     |

Existing files are **never overwritten** unless you pass `--force` (the `settings.json` hooks are
merged in non-destructively, and `.ailed/` is added to `.gitignore`).

## Configuration (`memory/config.md`)

`init` generates `memory/config.md`, the **source of truth for tooling** that agents read
before acting. It configures the language, trigram, output style and integrations:

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

The dev ticket prefix (e.g. `ZZM-000001`) is a **trigram derived from the project name**
(first 3 letters of the folder), overridable:

```bash
npx @s2bp/ai-led-framework init --trigram=ZZM
```

### Output style

The **verbosity level** of agents and reports — `concise` · `standard` (default) · `detailed`.
This setting drives *presentation only* (the Claude Code display, `/ailed-status` syntheses, text
pushed to Jira/Confluence); `memory/` always stays **complete and git-versioned** whatever you pick.

```bash
npx @s2bp/ai-led-framework init --style=concise
```

- `concise` — "get to the point" mode: no preamble or restating, short bullets, tables over prose,
  and on Jira a title + acceptance criteria as bullets. It **never** hides a risk, decision or
  blocker — cut the fluff, not the substance.
- `standard` — clear, structured summary (default).
- `detailed` — full explanations: reasoning, discarded alternatives, extended context.

Editable any time in `memory/config.md`, or forced for a single run: `ai-led status --style=detailed`.

### LLM model per agent (token savings)

Each of the 21 agents runs on a **model chosen for its function**, so simple agents don't burn
premium tokens:

- `opus` — reasoning / judgment / critical review, where a bad output causes downstream rework
  (`brainstorm`, `architect`, `planner`, `pm`, `analyst`, `review`, `security-review`, `rca`);
- `sonnet` — capable standard execution at volume (`dev`, `ux`, `test`, `communication`, `release`,
  `fact-check`, `check-secu`, `seo-aso`, `monetization`, `knowledge-audit`, `init-memory`);
- `haiku` — mechanical collection / extraction (`scout`, `check-log`).

The mapping is the **“LLM model per agent” table in `memory/config.md`** (source of truth). The
harness reads the model from each agent's frontmatter, so after editing the table apply it:

```bash
npx @s2bp/ai-led-framework models        # print the effective mapping
npx @s2bp/ai-led-framework models sync    # apply the table to .claude/agents/*.md
```

You can also set a model at install time: `init --model-dev=opus --model-scout=sonnet`
(tier: `opus` · `sonnet` · `haiku` · `inherit`). `update` re-applies whatever the table says.

### Integrations (optional)

Monitoring, E2E tests and promo generation are **disabled by default** (`none`). As long as an
integration is set to `none`, the matching agent flags the missing prerequisite and stops
cleanly instead of assuming a tool. Enable them at install time or later by editing `config.md`:

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

| Area                  | Agent / skill involved                                                  | Example tool          |
| --------------------- | ----------------------------------------------------------------------- | --------------------- |
| Monitoring / logs     | `@ailed-check-log`                                                      | Sentry                |
| End-to-end tests      | `@ailed-test`, `@ailed-dev`                                             | Playwright            |
| Promo generation      | `/ailed-promo`, `@ailed-communication`                                  | Remotion              |
| Market watch          | `@ailed-scout`, `@ailed-fact-check`, `@ailed-analyst`, `@ailed-monetization` | MCP web / URLs        |
| SEO / ASO             | `@ailed-seo-aso`                                                        | Search Console, Ahrefs, App Store Connect |
| External ticketing    | `@ailed-pm`, `@ailed-planner`, `@ailed-dev`                            | Jira (Atlassian MCP)  |
| External documentation | `@ailed-communication`                                                 | Confluence (Atlassian MCP) |

> `@ailed-monetization` uses the **Watch** channel (no dedicated integration). `@ailed-seo-aso`
> degrades to **Watch** at low confidence when **SEO / ASO** is disabled.
>
> **External ticketing / documentation** — **mirror** principle: `memory/` stays the local source
> of truth; when `Jira`/`Confluence` is enabled, agents **additionally sync** to the tool via its
> MCP (a single **Atlassian MCP** covers both Jira **and** Confluence). Prerequisite: that MCP must
> be connected in the project's Claude Code, otherwise agents stay in local-file mode. When external
> ticketing is active, the **ticket ID is the Jira key** (e.g. `ZZM-123`, the trigram being the
> project key); the `ZZM-000001` format is only the local-file convention.
>
> **Where are tickets & docs created?** Everything lives in `memory/config.md` (*Tool coordinates*
> section). For **Jira**: project key = trigram by default, type *Task* for features
> (`@ailed-planner`) and *Bug* for incidents (`@ailed-check-log`) and CRITICAL/HIGH
> vulnerabilities (`@ailed-check-secu`). For **Confluence**: you provide a
> **single root page URL**; `@ailed-communication` creates an `AI LED FRAMEWORK` sub-page under it
> (if absent) and maintains **one page per `memory/*.md` file** (mirror, one-way `memory/` →
> Confluence). While a coordinate is missing, the agent **asks for the value (or lists it via the
> MCP), then writes it back to `config.md`** — never creation against a guessed target. See the
> examples below.

**Existing technical conventions (optional).** If the project already has a document describing its
coding conventions and technical organization, import it with `--conventions=<path>`: its content is
copied verbatim into `memory/conventions.md` (with a `Source:` header). `@ailed-architect`, `@ailed-dev`
and `@ailed-ux` read it before acting. Omit the flag and a `TODO` stub is installed instead — the file
may stay partially empty and be filled later by hand or via `@ailed-init-memory`.

**Local app (optional).** `config.md` also carries the **local app base URL** (plus, optionally,
its start command and a test account). That is the only coordinate `/ailed-screens` needs to
capture the screens a dev touched. While it reads `to set`, the skill asks for the value then
rewrites it into `config.md`.

### `init` options

```
--lang=fr|en        Language of the memory/ files (default: fr)
--trigram=XYZ       Ticket prefix (default: 3 letters of the folder name)
--monitoring=NAME   Monitoring tool, or disabled (default)
--e2e=NAME          E2E testing tool, or disabled (default)
--promo=NAME        Promo generation tool, or disabled (default)
--watch=NAME        Market-watch channel (web search MCP / URLs), or disabled (default)
--seo-aso=NAME      SEO / ASO tool (Search Console, Ahrefs, App Store Connect), or disabled (default)
--ticketing=NAME    External ticketing (e.g. Jira, via MCP), or disabled (default)
--docs=NAME         External documentation (e.g. Confluence, via MCP), or disabled (default)
--style=LEVEL       Agent/report output style: concise | standard | detailed (default: standard)
--conventions=PATH  Import an existing conventions / technical-organization file into memory/conventions.md (optional)
-y, --yes           Non-interactive mode (otherwise questions are asked in the terminal)
-f, --force         Overwrite existing files
```

## Updating an existing project

When a project already uses an **older version** of the framework, bump it to the latest with:

```bash
npx @s2bp/ai-led-framework@latest update
```

`update` is the safe counterpart of `init` for projects already on board:

| Target                                          | `update` behaviour                          |
| ----------------------------------------------- | ------------------------------------------- |
| `.claude/agents/`, `.claude/skills/`, `.claude/commands/` | **always rewritten** to the new version     |
| `memory/config.md`, `memory/process.md` (scaffold files) | **additive section merge**: sections the template gained are appended; your existing sections are **never** touched |
| `memory/*.md` (project data) **never edited**   | **cleanly rewritten** to the new version (detected via `.ailed/manifest.json`) |
| `memory/*.md` (project data) **edited**         | **preserved** as-is                          |
| New `memory/` files                             | **added**                                    |
| `CLAUDE.md`                                      | **left untouched**                          |

The config (trigram, integrations, language) is **re-read from `memory/config.md`**, so the
`{{TICKET_PREFIX}}`, `{{MONITORING}}`, … placeholders are re-applied correctly — you don't pass the
`init` flags again. Your own non-`ailed-` agents/skills/commands are left alone.

> **How does `update` know what you edited?** `init`/`update` record a hash of every `memory/` file
> they write into `.ailed/manifest.json` (gitignored, local). On the next `update`, a file whose hash
> is unchanged is deemed *pristine* → rewritten cleanly; otherwise it's preserved (data) or merged
> section-by-section (scaffold files `config.md`/`process.md`). Sections present on both sides but
> **diverging** are reported, never overwritten. A `conventions.md` imported via `--conventions=` is
> excluded from the manifest, so it's never treated as pristine and never overwritten.

> **Why `@latest`?** `npx` reuses a cached copy of the package; the `@latest` tag forces a fetch of
> the newest published version instead of re-running the one already cached.
>
> **Caveat:** an agent or skill that was **removed or renamed** in a newer version is *not*
> auto-deleted (it would risk deleting your own files). If you want a pristine framework tree, remove
> only the framework folders first, then re-run update:
>
> ```bash
> rm -rf .claude/agents .claude/skills .claude/commands
> npx @s2bp/ai-led-framework@latest update
> ```
>
> `memory/` and `CLAUDE.md` stay safe — they live outside the deleted folders.

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
| `@ailed-architect`       | Technical impacts + ADR · DDD & deployable targets         |
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

`ailed-status`, `ailed-adr`, `ailed-architecture-map`, `ailed-git-flow`, `ailed-quality-gate`,
`ailed-release-flow`, `ailed-promo`, `ailed-design-system`, `ailed-wireframe`,
`ailed-mockup-preview`, `ailed-screens`.

`ailed-design-system`, `ailed-wireframe` and `ailed-mockup-preview` enrich `@ailed-ux` (shared
design baseline, 3 wireframe variants, mockup render + screenshots). They rely on the native
Claude Code skills `frontend-design` and `chrome-devtools` when present in the target
environment, and degrade gracefully otherwise.

### `/ailed-screens` — the end-of-dev contact sheet

Where `ailed-mockup-preview` renders the **mockup** *before* the dev, **`/ailed-screens`** renders
the **real app** *after*: a **single HTML page** gathering the screens the ticket touched,
**desktop and mobile side by side**, with **one shot per state** (empty list, validation error,
confirmed action…). Enough to review the **wording, styling and actual behavior** at a glance,
without opening the app screen by screen.

- **Shot list deduced, then confirmed**: screens come from the branch diff, states from the
  ticket's acceptance criteria; the list is **shown to the human before any capture**, because
  the file → route deduction does get it wrong (shared component, dynamic routing, modal with no
  URL of its own).
- **For human eyes, not for the agent**: the images are **never read back** by an agent — the
  skill costs close to zero tokens and returns no verdict.
- **Ephemeral**: the sheet lands in `.ailed/screens/` (git-ignored), images inlined as base64 so
  it stays openable and shareable on its own. Nothing enters `memory/`.
- **Non-blocking**: it is not a quality gate. Without the `chrome-devtools` MCP or a reachable
  app, the skill flags the missing prerequisite and stops cleanly.

**`@ailed-dev`** calls it automatically before opening the MR when the ticket touches the UI, and
it stays callable by hand. The app base URL is set in `memory/config.md` § *Local app*.

## Project status & dashboard

Two complementary ways to get a read-only snapshot of the project (state, roadmap, kanban,
features, market watch, process):

- **`/ailed-status`** (in Claude Code) — an **intelligent synthesis** of `memory/` that
  highlights **what needs a decision** (pending human validations, candidate topics to
  promote, stale watch, disabled integrations).
- **`ai-led status`** (CLI) — a **deterministic, zero-token** terminal snapshot: progress bar,
  kanban counts and a "watch" list. Add `--html` to generate `ailed-status.html`, a **static**
  dashboard that opens on a **visual synthesis**: two **pie charts** (global progress + current
  milestone, approximate), three action counters (**bugs** to handle, open **vulnerabilities**,
  product **arbitrations** discovery → roadmap), a **chronological EPIC timeline**, and a
  **kanban board** — one column per non-`DONE` status plus the **5 latest `DONE`** tasks on the
  right, each card showing **milestone → EPIC → ID → title** and opening its detail in a popup.
  Archived tickets (`memory/archive/kanban.md`) count in too. Each `memory/` file's raw detail
  stays available, **collapsed** at the bottom — **no server, no project data sent**:

```bash
npx @s2bp/ai-led-framework status          # terminal snapshot
npx @s2bp/ai-led-framework status --html   # → ailed-status.html (open in a browser)
```

Both honor the **Output style** from `config.md` (`concise` tightens the output, `detailed` adds
milestones and in-progress tickets and expands the HTML accordions); `--style=…` forces it for a
run. The HTML loads `marked` + `mermaid` from a CDN to render the accordions' markdown and diagrams
(internet needed at view time).

## Live progress sidebar (`watch` / `dashboard`)

To **follow progress during a Claude Code session** — which epic / task is in flight, which agent
just finished, is working, or is about to work — without re-running `status`, the framework ships a
continuously refreshed **vertical sidebar**:

```bash
npx @s2bp/ai-led-framework watch        # the sidebar alone (drop it in a left-hand terminal)
npx @s2bp/ai-led-framework dashboard    # tmux/zellij split: sidebar on the left · claude on the right
```

Top to bottom, the sidebar shows exactly the requested hierarchy:

```
AI-LED · progress
────────────────────────────
✓ EPIC-1  Foundations         ← last treated epic
▶ EPIC-2  Payments            ← current epic
  ✓ ZZM-000011 Payment model    ← last treated task
  ▶ ZZM-000012 Checkout flow     ← current task
    ✓ @architect (done)          ← last agent
    ▶ @dev  impl checkout        ← current agent
    · @review                    ← upcoming agents (workflow chain)
    · @test
    · @communication
  · ZZM-000013 Refund           ← upcoming tasks
  · ZZM-000014 Webhooks
· EPIC-3  Reporting           ← next epic

2/6 tickets DONE · feature
```

**Glyph legend:** `✓` done (green) · `▶` in progress (blue) · `·` upcoming (dimmed). Status
detection is tolerant: `IN_PROGRESS`, `` `IN_PROGRESS` `` (backticks), `in progress`, `WIP`… are
all recognized (the `Status` column of `memory/kanban.md` / `memory/epics.md`).

> ⚠️ **Why a separate pane and not a frozen zone *inside* the Claude Code window?**
> Claude Code is a closed TUI whose rendering we don't control: a frozen in-window column can't be
> injected. A true frozen vertical left column is therefore obtained via a **terminal split** (tmux
> or zellij), with Claude Code on the right — hence `dashboard`.

**Data sources:**

- **Epics / tasks**: read from `memory/epics.md` and `memory/kanban.md` (statuses `DONE`,
  `IN_PROGRESS`, `TODO`…). Works even without the hook.
- **Agents (last / current / upcoming)**: fed by the `.claude/hooks/ailed-runtime-hook.js` hook
  (installed by `init`/`update`), wired via `.claude/settings.json` (`PostToolUse` on `Task`). On
  every subagent call it writes the active agent to `.ailed/runtime.json` (gitignored); the running
  agent shows a **live chrono** (`▶ @dev impl · 2m14s`) so the panel breathes even during a long
  agent run. **Upcoming agents** are projected from the detected workflow chain (Discovery / Feature
  / Incident / Security, see `memory/process.md`).
- **Main-loop heartbeat**: `PreToolUse` (matcher `*`) records the last tool the main loop touched,
  shown as `⋯ Edit · 3s` when no subagent is running — so the panel stays live during direct work,
  not only at agent boundaries. (This fires the hook on every tool call; remove the `PreToolUse`
  `*` entry from `.claude/settings.json` to opt out.)

> **Tilix / GNOME Terminal (VTE):** the refresh clears the scrollback (`\x1b[3J`) on each redraw, so
> the live pane no longer stacks stale frames in your scroll history.

**Options:** `--width=N` (sidebar width), `--once` (render once and exit),
`dashboard --cmd="…"` (command launched on the right of the split, default `claude`). A zellij
layout is generated at `.ailed/dashboard.kdl`.

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

## Concrete examples: Jira & Confluence on an existing project

Shared prerequisite: the **Atlassian MCP** (covers both Jira **and** Confluence) is connected in
the project's Claude Code. `memory/` stays the local source of truth; Jira/Confluence are its
shareable mirror.

### Example 1 — From a need to a Jira ticket (Feature workflow)

```bash
cd my-existing-project
npx @s2bp/ai-led-framework init --trigram=ZZM --ticketing=Jira --docs=Confluence
```

Then in Claude Code:

1. `/ailed-bootstrap` → since the project already exists, it chains `@ailed-init-memory` then
   `@ailed-knowledge-audit` to rebuild memory from the code.
2. `@ailed-brainstorm`: you describe the need ("allow PDF export of reports"). The agent produces
   a **challenged SPEC**. **→ human validation of the SPEC.**
3. `@ailed-pm` turns the SPEC into **EPICs** (and creates/updates the Jira epics via the MCP),
   `@ailed-architect` records ADRs in `memory/decisions.md` (mirrored to Confluence later by
   `@ailed-communication`). The Jira project key already defaults to `ZZM` — no other coordinate
   is needed at this stage.
4. `@ailed-planner` splits the EPIC into **atomic tickets**. For each ticket: write to
   `memory/kanban.md` **then create the Jira issue** via the MCP. The issue comes back with its
   key `ZZM-123`, which becomes the ticket ID mirrored in `memory/kanban.md`.

Result: a Jira ticket `ZZM-123` created, tracked locally, linked to its EPIC and the SPEC.

### Example 2 — Develop an existing Jira ticket

```bash
cd my-existing-project
npx @s2bp/ai-led-framework init --trigram=ZZM --ticketing=Jira --docs=Confluence
```

Then in Claude Code:

1. `/ailed-bootstrap` (rebuilds memory if not done yet).
2. `@ailed-dev ZZM-123`: the issue **already exists in Jira** (created by another team, say). The
   agent **pulls it via the MCP** (title, description, acceptance criteria) and **mirrors it into
   `memory/kanban.md`** if absent. It moves the issue `TODO → IN_PROGRESS`, creates the branch
   `feat/ZZM-123-...`, develops, opens the **MR** (never merges), links the MR URL to the issue
   and moves it to `TO_TEST`.
3. `@ailed-review` then `@ailed-test` validate the MR; `@ailed-communication` updates the local
   changelog **and syncs the Confluence mirror**: an `AI LED FRAMEWORK` sub-page (created if absent
   under the root page), one page per `memory/*.md` file. On the **first** pass, since the root
   page is `to set`, the agent asks for the **Confluence URL** (e.g.
   `…/wiki/spaces/RDP/pages/2883387645/Feedback+Management`) and saves it to `config.md`.

> If the Atlassian MCP is **not** connected, each agent flags it and **continues in local-file
> mode**: no blocking, just no external sync.

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
