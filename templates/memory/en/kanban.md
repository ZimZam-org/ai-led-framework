# Kanban

Last Updated: {{DATE}}

Statuses: `TO_CHECK` · `TODO` · `IN_PROGRESS` · `TO_TEST` · `DONE`.
Dev ticket ID convention: `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, … (the `{{TICKET_PREFIX}}` prefix is the project trigram, defined in `memory/config.md`)
Clarification tickets (`TO_CHECK`) carry a `CK-` prefix.

This kanban keeps **only live tickets inline** (`TO_CHECK`→`TO_TEST`) plus `DONE` tickets **not
yet shipped**. At release time, `@ailed-release` **archives** the shipped `DONE` tickets to
`memory/archive/kanban.md`. It archives a ticket only when `memory/features.md` records its
functionality (see "Memory rotation & cleanup" in `memory/process.md`). The active file then
carries a `> Archives: memory/archive/kanban.md` line at the top. Agent reads stay light.

`@ailed-pm`, `@ailed-planner` and `@ailed-release` maintain this file.

**EPIC** column: parent EPIC (`memory/epics.md`). **Solution(s)** column: `short ID` of the
impacted targets (registry `memory/architecture.md`).

**Cell weight: {{MAX_CELL_BYTES}} bytes at most.** A bigger cell is a specification: its detail
— analysis, inventory, test protocol, history — lives in `memory/specs/` and the cell links to
it. **This file is a table, not a journal**: an EPIC narrative or a review report goes to
`memory/specs/`, the history of what shipped to `memory/archive/kanban.md`. An update is made
**in place**: fix the cell, do not add one more dated comment under the table. Without these
rules, an 85-ticket kanban reaches 300 kilobytes. An agent then pays ~79,000 tokens per read.

An **unrequested** finding (debt, a minor bug, an idea) does not belong here: it goes to
`memory/observations.md` (see `memory/process.md` § Unrequested findings).

| ID | Created | Status | EPIC | Title | Description | Solution(s) | Technical detail | Mockup |
| -- | ------- | ------ | ---- | ----- | ----------- | ----------- | ---------------- | ------ |

## Development backlog (tickets {{TICKET_PREFIX}}-*)

Broken down by `@ailed-planner` from `memory/epics.md`. Each ticket: independent, testable, achievable in **a single MR**. Acceptance criteria inherited from the SPEC.
Initial status: `TODO`. Branch convention: `feat/{{TICKET_PREFIX}}-00000X-...`.

### EPIC-1 — App foundations
| ID | Created | Status | EPIC | Title | Description | Solution(s) | Technical detail | Mockup |
| -- | ------- | ------ | ---- | ----- | ----------- | ----------- | ---------------- | ------ |
