# Kanban

Last Updated: {{DATE}}

Statuses: `TO_CHECK` · `TODO` · `IN_PROGRESS` · `TO_TEST` · `DONE`.
Dev ticket ID convention: `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, … (the `{{TICKET_PREFIX}}` prefix is the project trigram, defined in `memory/config.md`)
Clarification tickets (`TO_CHECK`) carry a `CK-` prefix.

This kanban keeps **only live tickets inline** (`TO_CHECK`→`TO_TEST`) plus `DONE` tickets **not
yet shipped**. At release time, `@ailed-release` **archives** the shipped `DONE` tickets to
`memory/archive/kanban.md` once their functionality is captured in `memory/features.md`
(see "Memory rotation & cleanup" in `memory/process.md`) — hence a `> Archives:
memory/archive/kanban.md` line at the top once an archive exists. This keeps agent reads light.
Maintained by `@ailed-pm` / `@ailed-planner` / `@ailed-release`.

**EPIC** column: parent EPIC (`memory/epics.md`). **Solution(s)** column: `short ID` of the
impacted targets (registry `memory/architecture.md`).

| ID | Created | Status | EPIC | Title | Description | Solution(s) | Technical detail | Mockup |
| -- | ------- | ------ | ---- | ----- | ----------- | ----------- | ---------------- | ------ |

## Development backlog (tickets {{TICKET_PREFIX}}-*)

Broken down by `@ailed-planner` from `memory/epics.md`. Each ticket: independent, testable, achievable in **a single MR**. Acceptance criteria inherited from the SPEC.
Initial status: `TODO`. Branch convention: `feat/{{TICKET_PREFIX}}-00000X-...`.

### EPIC-1 — App foundations
| ID | Created | Status | EPIC | Title | Description | Solution(s) | Technical detail | Mockup |
| -- | ------- | ------ | ---- | ----- | ----------- | ----------- | ---------------- | ------ |
