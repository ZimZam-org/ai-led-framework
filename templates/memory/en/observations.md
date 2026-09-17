# Observations

Last Updated: {{DATE}}

Log of **unrequested findings**: technical debt, a minor bug, an improvement idea, a
documentation gap, an open question. An agent that notices something outside its mission
writes it **here**, never in `memory/kanban.md`.

This file is **not a backlog**. It is the technical counterpart of `memory/market-watch.md`:
capture widely, commit narrowly. The kanban holds only what a human decided to do.

## What goes where

| Finding | Destination |
| ------- | ----------- |
| Explicitly requested by a human | `memory/kanban.md` (ticket) |
| `CRITICAL` or `HIGH` severity (security, data loss, broken production) | `memory/kanban.md` (ticket) + this file |
| Everything else | this file **only** |

## Life cycle

- **Statuses**: `open` · `promoted` (became a ticket) · `dropped` (human decision) · `stale`.
- **Promotion**: a human alone promotes an observation into a ticket. An agent **proposes**,
  it does not create. The row then turns `promoted` and carries the ticket ID.
- **Staleness**: an `open` observation older than **90 days** turns `stale`. Nobody judged it
  important enough in three months; keeping it open says nothing any more.
- **Rotation**: `dropped` and `stale` rows move to `memory/archive/observations.md`
  (see `memory/process.md` § Rotation). The framework deletes nothing.

## Register

| Date | Source | Severity | Finding | Status | Ticket |
| ---- | ------ | -------- | ------- | ------ | ------ |

> **Source**: the agent or skill that made the finding (`@ailed-dev`, `@ailed-review`, …).
> **Severity**: `CRITICAL` · `HIGH` · `MEDIUM` · `LOW`. Only the first two also open a
> ticket. **Finding**: one sentence, a fact, a file path. No analysis — analysis belongs to
> the promotion step, not to the capture step.
