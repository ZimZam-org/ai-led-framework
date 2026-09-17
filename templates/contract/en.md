## AI-Led framework

This project runs on the **AI-Led** framework (v{{FRAMEWORK_VERSION}}): persistent memory
(`memory/`), `ailed-*` prefixed agents (`.claude/agents/`) and skills (`.claude/skills/`).

### Non-negotiable rules

1. **`memory/` is the source of truth.** Read it before a task, update it after.
   Never rely on "what was said earlier" for a durable fact.
2. **No development without a ticket; no ticket without a human-approved SPEC.**
   Tickets live in `memory/kanban.md` (prefix `{{TICKET_PREFIX}}-`).
3. **Do not create work outside your mission.** An incidental finding — debt, a minor
   bug, an improvement idea, a documentation gap — does not become a ticket: it goes to
   `memory/observations.md`. Only two things enter the kanban directly: an explicit human
   request, and a `CRITICAL` or `HIGH` severity. See `memory/process.md` § "Unrequested
   findings".
4. **`memory/kanban.md` is a table, not a journal.** No cell past {{MAX_CELL_BYTES}} bytes:
   beyond that it is a specification, and it lives in `memory/specs/`. An EPIC narrative or a
   review report does not belong in the kanban. An update is made **in place**; it does not
   pile up as dated comments.
5. **`memory/config.md` is authoritative on tooling.** An integration set to
   `{{DISABLED}}` is unavailable: report the missing prerequisite and stop. A connected
   MCP is **never** an activation.
6. **Honour each agent's inputs/outputs** (`.claude/agents/`) and the human approval
   points of the workflows (`memory/process.md`).
7. **Every text produced follows `memory/writing-rules.md`**: one idea per sentence, 20
   words at most, active voice, one term = one meaning. The language is that of `memory/`.

### Getting started

`/ailed-bootstrap` boots a session. The workflows (Discovery / Feature / Incident /
Security) and their human approval points are described in `memory/process.md`.

### Maintenance

`npx @s2bp/ai-led-framework doctor` checks that the install is operational.
`npx @s2bp/ai-led-framework archive` moves shipped tickets out of the kanban.
