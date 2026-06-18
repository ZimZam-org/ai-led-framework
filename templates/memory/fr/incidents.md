# Incidents

Last Updated: {{DATE}}

Maintenu par `@ailed-check-log` (via MCP {{MONITORING}}, Coralogix, ...) et `@ailed-rca`

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

Dès qu'un environnement est déployé, configurer {{MONITORING}} (ou équivalent) et brancher `@ailed-check-log` sur l'analyse des dernières 24 h.

