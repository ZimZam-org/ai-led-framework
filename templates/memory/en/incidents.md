# Incidents

Last Updated: {{DATE}}

Maintained by `@ailed-check-log` (via {{MONITORING}} MCP, Coralogix, ...) and `@ailed-rca`

> Rotation: keep active incidents here (open or < 90 days); archive the rest in
> `memory/archive/incidents.md` (see `memory/process.md` § Memory rotation).

## Incident registry

NONE

## Entry format (to be used by `@ailed-rca`)

```markdown
### INC-YYYYMMDD-NN — <title>
- Date / detection:
- Severity: CRITICAL | HIGH | MEDIUM | LOW
- Cause:
- Impact:
- Reproduction:
- Fix:
- Prevention:
```

As soon as an environment is deployed, configure {{MONITORING}} (or equivalent) and wire `@ailed-check-log` onto the analysis of the last 24 h.
