# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.16.0]

### Added
- **Ticket history, captured deterministically.** `memory/kanban.md` only ever carried a creation
  date, and adding transition columns would have taxed every agent that reads that table. The
  runtime hook now **re-diffs the kanban statuses on every write** (live board + archive) and
  appends the transitions to **`.ailed/journal.jsonl`** — one line per status change. Zero tokens,
  no agent discipline required, and a `sed` run through Bash is caught just like an `Edit` because
  it is the *file signature* that gets compared, not the tool that wrote it. A ticket's popup in
  the dashboard now shows **created → development started → handed to test → finalised**, with the
  elapsed time between steps and the total lead time. A step that predates the journal reads
  **"not recorded"** rather than being guessed, and a first run never fabricates history.
- **Screens captured at test time, inside the ticket.** `/ailed-screens` now writes to
  **`.ailed/screens/<ticket>/<timestamp>/`** — one PNG per shot, a `meta.json` captioning them
  (screen, route, state, acceptance criterion, viewport, unreachable states, console errors) and
  a `sheet.html` to open. Those shots **surface on their own in the ticket popup**, grouped by
  screen × state with desktop and mobile side by side; click for full screen. `@ailed-test` now
  **offers** the capture after a `PASS` on a UI ticket — an offer, never a quality gate.
- **`ai-led status --html --live`** regenerates the payload as soon as `memory/` or the
  screenshots change, so the open report follows the session. `--interval=MS` tunes the poll.
- **`ai-led status --html --snapshot`** produces the timestamped, 100% self-contained file
  (shots inlined as base64) for sharing or archiving a review.
- **`ai-led clean`** bounds what the runtime leaves on disk: `--screens` keeps only the latest
  sheet per ticket, `--journal` compacts the transition log. `.ailed/` is derived and git-ignored,
  so nothing versioned is ever touched.

### Changed
- **EPIC timeline nodes are now progress pies.** An empty circle said nothing about where an
  in-flight EPIC stood; each node now fills with the share of its `DONE` tickets and carries the
  figure (`45% · 5/11`). An EPIC with no linked ticket reads **"no ticket"** instead of a
  misleading 0%.
- **The dashboard is a live report, not a timestamped one.** `status --html` writes
  **`ailed-status.html`** — a stable name to keep open in a tab and bookmark. It **redraws itself**
  when the data changes, preserving scroll position and replaying an open popup against the fresh
  data. The mechanism: the HTML shell (~70 KB) is split from its payload
  (`.ailed/status/data.js`), reloaded through a **`<script>` tag rather than `fetch()`** — over
  `file://`, `fetch()` is blocked by CORS while a script tag is not — with a content fingerprint
  gating the redraw so the page does not flicker on every poll.
  A single file rewritten each run **does not grow over time**: its size tracks the current state,
  not the number of generations. What did accumulate was the old `<timestamp>_ailed-status.html`
  (one file per run, at the project root, and not git-ignored). The one item that genuinely grows
  is the screenshots, so they stay **PNG files referenced relatively** and lazily loaded —
  inlining one shot costs ~300 KB of report.
- `PostToolUse` is now wired on **every tool** rather than `Task` only: the ticket journal must
  see any write that moves a kanban status. The hook compares a file signature first, so a tool
  that touched nothing costs one `stat()`. Existing wirings are upgraded in place, without
  duplicates.
- `init` / `update` now git-ignore **every generated report** — `ailed-status.html`,
  `*_ailed-status.html` and `*_ailed-memory-diff.html`. Until 0.15.0 only `.ailed/` was ignored, so
  the timestamped reports piled up as *tracked* files in many projects. A `.gitignore` cannot
  untrack an already-indexed file, so `update` **lists** the reports still tracked and hands over
  the `git rm --cached` command — it never deletes anything versioned itself. Missing entries are
  appended **inside the existing AI-Led block** rather than under a fresh header, so a long-lived
  project's `.gitignore` does not accumulate one comment block per version.
- CI now covers the paths this release touches: the shell/payload split (and that the shell carries
  no project data of its own), `--snapshot` self-containment, the hook journaling a `sed`-through-`Bash`
  transition while inventing nothing on its first run, and an `update` that preserves project
  memory + `CLAUDE.md` while re-wiring the hook to a single `*` matcher.

### Fixed
- Mermaid diagrams in the memory accordions were rendered while their container was still
  `display:none`, so they were measured at ~16 px wide and logged
  `<g> attribute transform: Expected number, "translate(undefined, NaN)"` 28 times. Rendering is
  now deferred until the detail panel is actually visible: diagrams come out at full width and the
  console stays clean.

## [0.15.0]

### Added
- New skill **`/ailed-memory-diff`** + the deterministic command
  **`ai-led memory-diff [--since=REF] [--until=REF] [--html] [--out=PATH] [--clip]`** — review
  what the agents changed in `memory/`. The memory is the source of truth and the agents rewrite
  it constantly; before a human validates a SPEC, an ADR or a release, the useful question is
  **what changed and where**, not what the file says. The command renders the git diff of
  `memory/` **grouped by markdown section** (`file → H2 › H3 breadcrumb → added/removed lines`)
  with the **tickets** each file touches (trigram read from `memory/config.md`), and raises the
  review flags a memory diff deserves: **deleted section**, `Last Updated` **not bumped**, and
  `memory/` files **not committed** (invisible to `git diff`, yet a change as far as review goes).
  Deterministic and **zero-token**: the skill runs the command first and only adds the
  interpretation (cross-file consistency, content deleted without archiving, unsourced figures)
  plus a verdict. **Strictly read-only** — it never fixes a diff.
- `memory-diff` summarizes rather than unfolds what carries no review value: an **entirely new**
  file over 60 lines (a fresh SPEC is all `+` over thousands of lines) is rendered as its **table
  of contents**, and a **non-Markdown** `memory/` file (an `@ailed-ux` HTML mockup) as its size
  alone. `--full` unfolds both. Measured on a real project: 2,395 lines of terminal output down
  to 115 for the same four changed files.
- `memory-diff --html` writes a **static, self-contained** report
  (`<timestamp>_ailed-memory-diff.html`): no CDN, no script, no data sent, light/dark following
  the system theme. `--clip` loads the same report as `text/html` onto the clipboard so it pastes
  **formatted** into Teams / Slack / Outlook / Confluence, which do not accept Markdown — via
  `wl-copy` (Wayland) / `xclip` (X11) / `osascript` (macOS), with **no `pandoc` dependency**, and
  a readback check so a success message is never printed for a clipboard that stayed empty.
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
  rewrites the value there — never captures against a guessed target. On a project installed
  before that section existed it is simply absent: the skill asks and creates it rather than
  failing.
- `/ailed-screens` hardened against three failures found by running it end to end on a real
  Vite + Supabase back-office:
  - **`take_screenshot` must be given `filePath`.** Without it the MCP attaches the image to the
    tool response — it lands in the agent's context (exactly what the skill promises to avoid)
    and the transfer can stall for minutes. Measured: two 120 s+ hangs without `filePath`,
    instant with it. The capture sequence is now spelled out (`resize_page` → `navigate_page` →
    `take_screenshot(filePath)`, grouped per viewport).
  - **The base branch is resolved, not assumed.** `main` does not exist everywhere: the skill now
    walks `origin/HEAD` → `main` → `master` → the base declared in memory, and an **empty diff no
    longer means "no screen touched"** — it falls back to the last commits actually touching the
    app and names the commit it took as the perimeter. On the test project, the naive `main`
    lookup returned 0 files and would have stopped the skill dead.
  - **`.ailed/` being git-ignored is verified, not asserted.** Projects installed before the
    `.gitignore` wiring lack the entry, so the sheet would leave untracked files in `git status`;
    the skill now checks and adds it before writing. Its "writes nothing" claim is also corrected
    to name its two real setting writes (the base URL, the ignore entry).

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

[Unreleased]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/ZimZam-org/ai-led-framework/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/ZimZam-org/ai-led-framework/releases/tag/v0.8.0
