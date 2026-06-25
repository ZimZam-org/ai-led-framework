# Kanban

Last Updated: {{DATE}}

Statuses: `TO_CHECK` · `TODO` · `IN_PROGRESS` · `TO_TEST` · `DONE`.
Dev ticket ID convention: `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, … (the `{{TICKET_PREFIX}}` prefix is the project trigram, defined in `memory/config.md`)
Clarification tickets (`TO_CHECK`) carry a `CK-` prefix.
Tickets shipped in a release may be removed. Maintained by `@ailed-pm` / `@ailed-planner`.

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
