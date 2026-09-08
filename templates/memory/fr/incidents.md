# Incidents

Last Updated: {{DATE}}

Maintenu par `@ailed-check-log` (via MCP {{MONITORING}}, Coralogix, ...) et `@ailed-rca`

> Rotation : garder ici les incidents actifs (non clôturés ou < 90 j) ; archiver le reste dans
> `memory/archive/incidents.md` (cf. `memory/process.md` § Rotation de la mémoire).

## Registre des incidents

NONE

## Format d'entrée (à utiliser par `@ailed-rca`)

```markdown
### INC-YYYYMMDD-NN — <titre>
- Date / détection :
- Sévérité : CRITICAL | HIGH | MEDIUM | LOW
- Cause :
- Impact :
- Reproduction :
- Correction :
- Prévention :
```

Dès la première mise en production, configurer {{MONITORING}} (ou son équivalent).
Brancher ensuite `@ailed-check-log` sur les dernières 24 h de logs.

