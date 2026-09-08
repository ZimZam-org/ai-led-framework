# AI-Led Configuration

Last Updated: {{DATE}}

This file carries the project's tooling choices. It is their source of truth.
`npx @s2bp/ai-led-framework init` generates it, and a human edits it by hand at any time.
**Agents read it before acting** and adapt their behaviour, in particular when an integration
reads `{{DISABLED}}`.

## Identity

- Project trigram (ticket prefix): `{{TICKET_PREFIX}}`
  → dev tickets carry the names `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, …

## Output style

- Agent & report communication style: `{{OUTPUT_STYLE}}`
  → values: `concise` · `standard` · `detailed` (default: `standard`).

**Read by every agent and by `ai-led status`.** This setting drives *presentation only* — never
the content of `memory/`, which stays the **complete, git-versioned source of truth**. It applies
to: the Claude Code display, syntheses (`/ailed-status`) and the text pushed to external tools
(Jira / Confluence).

| Value      | Expected behaviour |
| ---------- | ------------------ |
| `concise`  | "Get to the point" mode. No preamble or wrap-up, no restating the request, no transition sentences. Short bullets (one idea per line), tables over prose. On Jira: title + acceptance criteria as bullets, no narration. |
| `standard` | Clear, structured summary with useful context but no filler. Default behaviour. |
| `detailed` | Full explanations: reasoning, discarded alternatives, extended context. For onboarding, audits or deep reviews. |

> `concise` never means dropping critical information (risk, decision, blocker): cut the fluff,
> not the substance. `memory/` is always filled in full regardless of this setting.

## Writing

- Writing standard for produced text: `{{WRITING_NORM}}`
  → values: `ste` · `{{DISABLED}}` (default: `ste`).

**Read by every agent.** The rules live in `memory/writing-rules.md`: a profile derived from
ASD-STE100 (*Simplified Technical English*). Goal: a text understood at once, and still
understood in six months.

`ste` sets 12 rules. The first five already change the result:

1. one idea per sentence, 20 words at most (25 for an instruction);
2. active voice, present tense, explicit subject; imperative for an instruction;
3. one term = one meaning: `memory/glossary.md` is the authority and bans synonyms;
4. no acronym the glossary does not define; three words per noun cluster at most;
5. measured facts (number, ID, file name) instead of adjectives.

**Two distinct settings.** *Output style* sets the **volume** of the text. *Writing* sets the
**shape of the sentences**, whatever that volume. A `detailed` report therefore still uses
short, active sentences.

**Language.** The text uses the language of the `memory/` files. The French and English
profiles share the 12 rules; only the lists of forbidden phrases differ.

**Out of scope.** Promotional content (`/ailed-promo`, promo outputs of
`@ailed-communication`) follows the brand voice. Code and commit messages follow
`memory/conventions.md`.

**Check.** `npx @s2bp/ai-led-framework lint` checks the measurable rules on `memory/`
(`file:line` + rule). `/ailed-quality-gate` includes that check. The `{{DISABLED}}` value
disables the standard and the check.

## Technical conventions (optional)

`memory/conventions.md` describes the coding conventions and the technical organization
**already in place**. The install fills it (`--conventions=<path>`, verbatim import); otherwise
a human or `@ailed-init-memory` completes it. **`@ailed-architect`, `@ailed-dev` and
`@ailed-ux` read it** before acting. The file may stay partially empty.

## LLM model per agent

Each agent runs on a **model chosen for its function**, to cut token usage without degrading
quality where it matters:

- `opus` — reasoning, judgment, critical review (a bad output causes downstream rework);
- `sonnet` — standard execution, high volume (dev, tests, writing);
- `haiku` — mechanical collection / extraction, little reasoning.

**This table is the source of truth.** The harness reads the model from each agent's *frontmatter*
(`.claude/agents/*.md`): after editing a row below, apply it with
`npx @s2bp/ai-led-framework models sync`. `models` (no argument) prints the effective table.
Allowed values: `opus` · `sonnet` · `haiku` · `inherit` (inherit the session model).

{{MODELS_TABLE}}

## Integrations

| Area                  | Tool             | Agent / skill involved                 |
| --------------------- | ---------------- | -------------------------------------- |
| Monitoring / logs     | `{{MONITORING}}` | `@ailed-check-log`                     |
| End-to-end tests      | `{{E2E}}`        | `@ailed-test`, `@ailed-dev`            |
| Promo generation      | `{{PROMO}}`      | `/ailed-promo`, `@ailed-communication` |
| Market watch          | `{{WATCH}}`      | `@ailed-scout`, `@ailed-fact-check`, `@ailed-analyst`, `@ailed-monetization` |
| SEO / ASO             | `{{SEO_ASO}}`    | `@ailed-seo-aso` |
| External ticketing    | `{{TICKETING}}`  | `@ailed-pm`, `@ailed-planner`, `@ailed-dev`, `@ailed-check-log`, `@ailed-rca`, `@ailed-check-secu` |
| External documentation | `{{DOCUMENTATION}}` | `@ailed-communication` |

> Possible values: a tool name (e.g. `Sentry`, `Playwright`, `Remotion`, `Jira`,
> `Confluence`) or `{{DISABLED}}`. Facing an integration that reads `{{DISABLED}}`, the matching
> agent **flags the missing prerequisite and stops cleanly**: it never assumes a tool.
> To activate the integration later, replace `{{DISABLED}}` with the tool name here.
> Then configure the associated MCP or pipeline.
>
> Two watch specifics. `@ailed-monetization` relies on the **Watch** channel: it has no
> dedicated integration. `@ailed-seo-aso` **degrades** to **Watch** at low confidence when
> **SEO / ASO** reads `{{DISABLED}}`. It stops only when **Watch** reads `{{DISABLED}}` too.

### Local app (screen contact sheet)

Where the app runs locally, **read by `/ailed-screens`** (end-of-dev contact sheet):

| Field                            | Value     |
| -------------------------------- | --------- |
| App base URL                     | `to set`  |
| Start command (optional)         | `to set`  |
| Test account (optional)          | `to set`  |

> Example **base URL**: `http://localhost:3000`. The **start command** reminds the human when
> the app does not answer. `/ailed-screens` never starts the app itself. The **test account**
> unlocks authenticated screens: **never put a real secret here**. Use a demo account id, or the
> environment variable holding it. While the URL reads `to set`, the skill **asks the human then
> rewrites the value here**. It never captures against a guessed target.

### External ticketing & documentation (Jira / Confluence via MCP)

**Mirror** principle: `memory/` stays the **local source of truth**. It lives offline,
git-versioned, and `ai-led status` reads it. When the project activates **External ticketing**
(e.g. `Jira`) or **External documentation** (e.g. `Confluence`), agents **additionally sync** to
the tool via its MCP. They never replace `memory/`.

- **Prerequisite**: the project's Claude Code needs the matching MCP (e.g. the Atlassian MCP,
  which covers both Jira **and** Confluence). Otherwise the agent flags the missing prerequisite
  and stays in local-file mode.
- **ID convention**: when **External ticketing** is active, the **ticket ID is the tool's key**
  (e.g. `{{TICKET_PREFIX}}-123`), with the trigram `{{TICKET_PREFIX}}` used as the **project key**.
  The zero-padded `{{TICKET_PREFIX}}-000001` format is only the local-file convention (Ticketing =
  `{{DISABLED}}`).
- **Sync direction (Jira)**: `@ailed-planner` pushes the ticket it creates to Jira (*feature*
  type). `@ailed-dev` pulls a ticket that **already exists** in Jira, then mirrors it into
  `memory/kanban.md`. **Incidents** (`@ailed-check-log`) and **CRITICAL/HIGH vulnerabilities**
  (`@ailed-check-secu`) create *bug*-type issues. `@ailed-rca` enriches the linked bug with its
  analysis: cause, impact, reproduction, fix, prevention.
- **Confluence mirror**: `@ailed-communication` maintains **one page per `memory/*.md` file**
  (page title = file title). These pages live under the **container sub-page
  `AI LED FRAMEWORK`**, created beneath the **root page** whose URL appears below.
  `memory/` stays the source of truth; these pages are its shareable mirror.

**Tool coordinates** (read by agents before any creation):

| Tool       | Field                                        | Value              |
| ---------- | -------------------------------------------- | ------------------ |
| Atlassian  | Site (cloud), if two sites or more           | `to set`           |
| Jira       | Project key (where tickets are created)      | `{{TICKET_PREFIX}}` |
| Jira       | Issue type — feature (`@ailed-planner`)      | `Task`             |
| Jira       | Issue type — bug (incident / security)       | `Bug`              |
| Confluence | Root page (URL of the parent page)           | `to set`           |
| Confluence | Container sub-page (created if absent)        | `AI LED FRAMEWORK` |

> Example **root page**: `https://your-company.atlassian.net/wiki/spaces/SPACE/pages/PAGE_ID/Page+Title`.
> The MCP derives the space and the parent page from it. It creates the `AI LED FRAMEWORK`
> sub-page when that page is missing, then it adds one page per `memory/*.md` file.
>
> The **Jira project key** defaults to the trigram: fix it if your Jira project uses another key.
> The MCP usually resolves the **Atlassian site**; set it when the account reaches two sites or
> more. While the **root page** reads `to set`, `@ailed-communication` **asks the human for the
> URL**. It can also list the spaces via the MCP. Then it **writes the value back here**.
> Creation never happens against a guessed target.
