# Configuration AI-Led

Last Updated: {{DATE}}

Source de vérité des choix d'outillage du projet. Renseigné par `npx @s2bp/ai-led-framework init`,
modifiable à la main à tout moment. **Les agents lisent ce fichier avant d'agir** et
adaptent leur comportement (notamment si une intégration vaut `{{DISABLED}}`).

## Identité

- Trigramme projet (préfixe de ticket) : `{{TICKET_PREFIX}}`
  → les tickets de dev sont nommés `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, …

## Conventions techniques (facultatif)

Les conventions de code et l'organisation technique **en place** sont décrites dans
`memory/conventions.md`. Renseignable à l'install (`--conventions=<chemin>`, import brut)
ou complété à la main / via `@ailed-init-memory`. **Lu par `@ailed-architect`, `@ailed-dev`
et `@ailed-ux`** avant d'agir. Le fichier peut rester partiellement vide.

## Intégrations

| Domaine                | Outil          | Agent / skill concerné            |
| ---------------------- | -------------- | --------------------------------- |
| Monitoring / logs      | `{{MONITORING}}` | `@ailed-check-log`                |
| Tests end-to-end       | `{{E2E}}`        | `@ailed-test`, `@ailed-dev`       |
| Génération promo       | `{{PROMO}}`      | `/ailed-promo`, `@ailed-communication` |
| Veille concurrentielle | `{{WATCH}}`      | `@ailed-scout`, `@ailed-fact-check`, `@ailed-analyst`, `@ailed-monetization` |
| SEO / ASO              | `{{SEO_ASO}}`    | `@ailed-seo-aso` |

> Valeurs possibles : un nom d'outil (ex. `Sentry`, `Playwright`, `Remotion`) ou `{{DISABLED}}`.
> Si une intégration vaut `{{DISABLED}}`, l'agent correspondant **signale le pré-requis manquant
> et s'arrête proprement** au lieu de supposer un outil. Pour activer une intégration plus
> tard, remplace `{{DISABLED}}` par le nom de l'outil ici et configure le MCP/pipeline associé.
>
> Cas particuliers de la veille : `@ailed-monetization` s'appuie sur le canal **Veille**
> (pas d'intégration dédiée). `@ailed-seo-aso`, lui, **dégrade** vers la **Veille** en confiance
> basse si **SEO / ASO** vaut `{{DISABLED}}`, et ne s'arrête que si la **Veille** l'est aussi.
