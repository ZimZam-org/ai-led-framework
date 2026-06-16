# Veille concurrentielle & tendances

Last Updated: {{DATE}}

Source de vérité de la veille. Trois sections **étanches** : brut → candidat → promu.
Règles : toute observation est **sourcée et datée** ; la veille **n'écrit jamais** dans
`roadmap.md` ; un sujet ne quitte le backlog que par **validation humaine** vers
`@ailed-brainstorm`. Maintenu par `@ailed-scout`, `@ailed-fact-check`, `@ailed-analyst`.

## Sources & cadence

- Canal de veille : voir `memory/config.md` (intégration **Veille**). `{{DISABLED}}` = veille inactive.
- Concurrents / flux suivis : TODO
- Cadence de rafraîchissement : TODO (ex. mensuelle)

## Observations brutes

Ajout par `@ailed-scout`, vérifié par `@ailed-fact-check`. Confiance : `haute` / `moyenne` / `basse`.
Observations rejetées ~~barrées~~ avec leur raison (jamais supprimées). Décote au-delà de 6 mois.

| Date | Source (URL) | Confiance | Observation | Catégorie |
| ---- | ------------ | --------- | ----------- | --------- |

## Backlog de sujets candidats

Dérivé par `@ailed-analyst` des observations **vérifiées**. Scores 1-5.
Statut : `candidat` · `écarté (raison)` · `validé→brainstorm`.
**Seul un humain** fait passer un sujet à `validé→brainstorm` ; il entre alors dans le workflow Feature.

| ID | Sujet | Hypothèse de valeur | Preuves (réf. obs.) | Impact | Effort | Alignement | Confiance | Statut |
| -- | ----- | ------------------- | ------------------- | ------ | ------ | ---------- | --------- | ------ |
