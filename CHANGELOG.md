# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New skill **`/ailed-screens`** — the end-of-dev contact sheet. It gathers the screens a
  ticket actually touched into **one self-contained HTML page** (`.ailed/screens/`), desktop
  and mobile side by side, with **one shot per state** taken from the ticket's acceptance
  criteria, so the wording, styling and actual behavior can be reviewed at a glance instead of
  opening the app screen by screen. The shot list is **deduced from the branch diff and the
  acceptance criteria, then confirmed by the human** before any capture (the file → route
  deduction is fallible). Images are inlined as base64 and **never read back by an agent**: the
  sheet is for human eyes, costs close to zero tokens, returns no verdict, and stays out of git
  and `memory/`.
- `@ailed-dev` calls `/ailed-screens` before opening the MR when the ticket touches the UI, and
  gains the `chrome-devtools` MCP authorization. **Non-blocking**: no `chrome-devtools`, no
  reachable app or no UI change means a flagged prerequisite, not a stopped workflow.
- `memory/config.md` gains a **Local app** section (base URL, optional start command and test
  account) read by `/ailed-screens`. While the URL is unset, the skill asks the human then
  rewrites the value there — never captures against a guessed target.

## [0.14.0]

### Added
- `status --html`: the **Current EPIC** panel is replaced by a real **kanban board** —
  one column per non-`DONE` status (`TO_CHECK` · `TODO` · `IN_PROGRESS` · `TO_TEST`,
  plus `Superseded`/`Other` when the memory holds such statuses) and, as the
  rightmost column, the **5 latest `DONE`** tasks. Each card shows **milestone →
  EPIC → ID → title** (title clamped to 4 lines) and opens a popup with its
  milestone, EPIC, status, creation date and description.
- Archived tickets (`memory/archive/kanban.md`) now feed the report, the terminal
  snapshot and the `watch` sidebar: without them, shipped EPICs looked ticket-less
  and the overall progress was understated.
- `SUPERSEDED` (and `OBSOLETE`/`CANCELLED`/`WONTFIX`/…) is recognised as a status:
  visible on the board and in the EPIC popups, but **excluded from the progress
  counters** so voided work never distorts them.

### Fixed
- `status --html`: the **Overview** lede no longer dumps the raw markdown of
  `project-state.md` § *État actuel* between the title and the charts. It now shows a
  bounded plain-text excerpt of the first paragraph, with the whole section rendered
  (bold, code, lists, tables) in a **Read the full state** popup. All report labels go
  through a small offline markdown renderer — no more `**`, backticks or link syntax
  anywhere in the page, nor in the `watch` sidebar.
- `status --html`: an EPIC popup could come up **empty** — its tickets were archived,
  carried an unrecognised status (`SUPERSEDED`), a status with a trailing comment
  (`DONE (PR #118, merged develop)`), or a multi-EPIC cell (`EPIC-1/2/3`). All four
  now resolve, and an EPIC with genuinely no ticket falls back to its definition from
  `memory/epics.md`.
- Markdown table rows are split on unescaped pipes only: cells containing `\|`
  (common inside code spans) are no longer truncated mid-content.
- Ticket IDs are de-duplicated when the live kanban and its archive are read together.

## [0.13.1]

### Changed
- `templates/memory/{en,fr}/config.md`: the example Confluence **root page** URL
  now uses fully generic placeholders (`your-company.atlassian.net`, `SPACE`,
  `PAGE_ID`, `Page+Title`) instead of a real organisation, space key, and page id.

## [0.13.0]

### Added
- Memory rotation & cleanup policy generalised in `process.md`: a table-driven
  active/archive split now also covers `kanban.md`, with **deterministic
  triggers** (incremental on edit, a ~40 active-entry size threshold, and kanban
  cleanup at release). `@ailed-release` archives shipped `DONE` tickets to
  `memory/archive/kanban.md` **only once `features.md` reflects the delivered
  functionality** — keeping agent reads light without ever losing data.
- `status --html` dashboard is now interactive: clickable **Overall progress**
  legend (lists the kanban tasks of each status), clickable **EPIC timeline**
  (lists an epic's tasks with their status), clickable action counters (**Bugs**,
  **Vulnerabilities**, **Product arbitrations**) opening detail popups, and a
  **Feature list** button opening the feature inventory (delivery/release info in
  the Notes column).

### Changed
- `status --html` report filename is now prefixed with a `YYYYMMDDHHmmss_` stamp
  (overridable via `--out`) so each run yields a distinct, sortable file.
- `status --html` dashboard UI is now in English; pie charts redrawn as donut
  charts with the percentage centered, and explicit card titles.
- Progress sidebar (`watch`) paints in-progress epics/tasks in **blue** (matching
  the HTML dashboard accent) instead of yellow.

### Fixed
- `status --html` produced an empty synthesis on real projects: the inline `DATA`
  JSON was injected with a string-pattern `String.replace`, so `$&`/`` $` ``/`$'`
  sequences in memory content corrupted the script (`Uncaught SyntaxError`). It is
  now injected via a function replacement, with `</`, U+2028 and U+2029 escaped.
- Kanban/epic status parsing (`watch` and `status`, terminal and HTML) is now
  tolerant of backticked (`` `IN_PROGRESS` ``), lower/mixed-case, accented and
  FR/EN status values; previously strictly-matched rows were silently dropped, so
  in-progress items showed neither the `▶` marker nor any highlight and progress
  pies/counts came out empty.

## [0.12.0]

### Changed
- Progress sidebar (`watch`) now lists **every** epic in order — done epics in
  green (`✓`), the in-progress epic in yellow (`▶`), not-started epics dimmed
  (`·`) — instead of a 3-epic window, so an in-progress epic located after a
  not-started one now correctly expands its tasks (last done, in-progress,
  upcoming). Each epic line shows its completion percentage flush-right
  (`100 × DONE tickets / total tickets`), and the footer gains a global progress
  bar. Tasks still expand under the current epic even when the kanban does not
  tag tickets with an EPIC id.

## [0.11.0]

### Added
- Live progress sidebar improvements: a chrono on the running agent
  (`▶ @dev impl · 2m14s`) and a main-loop heartbeat (`⋯ Edit · 3s`) so the panel
  breathes even during long agent runs or direct work; tracking broadened to all
  `Task` subagents (not only `ailed-*`).
- `update` now propagates template structure into existing `memory/` files:
  additive section merge for scaffold files (`config.md`, `process.md`), clean
  rewrite of never-edited files (tracked via `.ailed/manifest.json`), and edited
  project data preserved as-is.

### Fixed
- Progress sidebar no longer stacks stale frames in the scrollback of VTE
  terminals (Tilix, GNOME Terminal): each redraw clears the scrollback (`\x1b[3J`).
- `parseInstalledConfig` mis-read the SEO/ASO integration value from the per-agent
  LLM models table; the integration scan is now scoped to the Integrations section.

## [0.10.1]

### Added
- Open-source governance files: `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, GitHub issue/PR templates and a CI workflow.

## [0.10.0]

### Added
- Per-agent configurable LLM model and session hygiene.

## [0.9.0]

### Added
- Visual `status --html` report (pie charts, EPIC timeline, KPIs).
- Progress sidebar.

## [0.8.0] — previous releases

Earlier versions (`0.1.0` → `0.8.0`) established the core framework: the `init`
installer, the `ailed-*` agents and skills, the persistent `memory/` model, and
the Jira/Confluence (Atlassian MCP) integration. See the
[git history](https://github.com/ZimZam-org/ai-led-framework/commits/main) for details.

[Unreleased]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.13.1...HEAD
[0.13.1]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/ZimZam-org/ai-led-framework/releases/tag/v0.8.0
