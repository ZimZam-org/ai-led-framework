# Conventions & technical organization

Last Updated: {{DATE}}

> Three parts, in this order. *In-place conventions* describes what exists, with no judgement.
> *DDD audit* gives one verdict per in-place convention. *Target for new modules* prescribes
> the design of a new context.
>
> The part that governs a file depends on the file: legacy code and the adapters of the
> anti-corruption layer follow the in-place conventions; a new context follows the target.
> `architecture.md` answers "what we build"; this file answers "how we code here".
> Read by `@ailed-architect`, `@ailed-dev` and `@ailed-ux` before acting.

## In-place conventions

> Descriptive. Filled at install (`npx @s2bp/ai-led-framework init --conventions=<path>`), by
> `@ailed-init-memory`, or by hand. Stays empty on a `greenfield` project with no import.
> A change here triggers a new audit of the lines it touches.

### Code organization

TODO  (folder structure, module/layer breakdown)

### Naming conventions

TODO  (files, classes, functions, variables, branches, commits)

### Enforced patterns & rules

TODO  (mandated architecture patterns, required wrappers, forbidden anti-patterns)

### Stack & libraries

TODO  (mandated / forbidden libs, versions, rationale)

### Branching & review strategy

TODO  (branch model, MR rules, review requirements)

## DDD audit

> Filled by `@ailed-architect` before it writes the target, as soon as *In-place conventions*
> holds more than the placeholders. One row per extracted convention, with the title of its
> source section. Three verdicts: `compatible` (the target adopts it), `confined` (it governs
> legacy code and infrastructure; the anti-corruption layer translates to the domain types),
> `replaced` (an ADR writes the replacement convention into the target).
>
> Every verdict other than `compatible` cites a number from `/ailed-ddd-checklist`.
> A human validates the audit together with the target, at the validation point after `Architect`.

| Convention | Source section | Verdict | Anti-pattern (no.) | ADR |
| ---------- | -------------- | ------- | ------------------ | --- |

## Target for new modules

> Prescriptive. Filled by `@ailed-architect` after the audit; a human validates the target
> together with the audit. Holds only `compatible` conventions and replacement conventions.
> On a `greenfield` project with no import, this part is the only convention of the project.

### Context organization

TODO  (tree by subdomain, then by layer: domain, application, infrastructure)

### Domain naming

TODO  (approved terms of the context in `glossary.md`; use cases, aggregates, value objects, ports)

### Target patterns

TODO  (aggregate owning its invariants, one repository per aggregate, read port, one port per
       neighbour context, anti-corruption layer)

### Target stack

TODO  (libs chosen for a new context, versions, rationale)

### Boundary contract

TODO  (chosen tool, ADR, location of the contract and of the baseline, command to run)
