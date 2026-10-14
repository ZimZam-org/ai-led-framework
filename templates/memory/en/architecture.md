# Architecture

Last Updated: {{DATE}}

## Solutions / deployable targets

> Registry of the project's shippable solutions (**source of truth**). In a monorepo, list
> every target: mobile app, web backoffice, institutional website, shared packages…
> The `short ID` (e.g. `mobile`, `backoffice`, `site`) is the **tag** reused across
> `roadmap.md`, `epics.md` and `kanban.md`. Maintained by `@ailed-architect` / `@ailed-init-memory`.

| Short ID | Type | Stack | Description | Domains (DDD) |
| -------- | ---- | ----- | ----------- | ------------- |

### Business-domain breakdown (DDD)

> Filled in by `@ailed-architect` for every SPEC that creates a module or restructures an area.
> Each bounded context has its model in `memory/contexts/<context>.md` (`/ailed-context-model`).
> The `Domains (DDD)` column of the registry points to that file.
> **Human validation required**: the model goes from `PROPOSED` to `VALIDATED`.
> A target shares a domain with other targets, or keeps it for itself alone.
> Each iteration enriches the existing breakdown. An ADR traces any structural rework.

TODO

## Application architecture

TODO

## Technical decisions (accepted)

| Topic | Decision | Ref. |
| ----- | -------- | ---- |

## Data model

TODO

## Infrastructure architecture

TODO

## Databases

TODO

## APIs

TODO

## External integrations

TODO
