# Configuration AI-Led

Last Updated: {{DATE}}

Source de vérité des choix d'outillage du projet. Renseigné par `npx ai-led init`,
modifiable à la main à tout moment. **Les agents lisent ce fichier avant d'agir** et
adaptent leur comportement (notamment si une intégration vaut `aucun`).

## Identité

- Trigramme projet (préfixe de ticket) : `{{TICKET_PREFIX}}`
  → les tickets de dev sont nommés `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, …

## Intégrations

| Domaine                | Outil          | Agent / skill concerné            |
| ---------------------- | -------------- | --------------------------------- |
| Monitoring / logs      | `{{MONITORING}}` | `@ailed-check-log`                |
| Tests end-to-end       | `{{E2E}}`        | `@ailed-test`, `@ailed-dev`       |
| Génération promo       | `{{PROMO}}`      | `/ailed-promo`, `@ailed-communication` |

> Valeurs possibles : un nom d'outil (ex. `Sentry`, `Playwright`, `Remotion`) ou `aucun`.
> Si une intégration vaut `aucun`, l'agent correspondant **signale le pré-requis manquant
> et s'arrête proprement** au lieu de supposer un outil. Pour activer une intégration plus
> tard, remplace `aucun` par le nom de l'outil ici et configure le MCP/pipeline associé.
