# Veille concurrentielle & tendances

Last Updated: {{DATE}}

Source de vérité de la veille. Trois sections **étanches** : brut → candidat → promu.
Règles : toute observation est **sourcée et datée** ; la veille **n'écrit jamais** dans
`roadmap.md` ; un sujet ne quitte le backlog que par **validation humaine** vers
`@ailed-brainstorm`. Maintenu par `@ailed-scout`, `@ailed-seo-aso`, `@ailed-monetization`,
`@ailed-fact-check`, `@ailed-analyst`.

## Sources & cadence

- Canal de veille : voir `memory/config.md` (intégration **Veille**). `{{DISABLED}}` = veille inactive.
- Concurrents / flux suivis : TODO
- Cadence de rafraîchissement : TODO (ex. mensuelle)

## Observations brutes

Ajout par `@ailed-scout`, `@ailed-seo-aso`, `@ailed-monetization` ; vérifié par `@ailed-fact-check`.
Confiance : `haute` / `moyenne` / `basse`. Catégories : `feature`, `pricing`, `tendance`, `ux`,
`seo`, `aso`, `monetization`… Décote au-delà de 6 mois (plus rapide pour
`seo`/`aso`/`monetization`, volatils).
Rotation : les observations rejetées (avec leur raison) ou décotées (> 6 mois) sont **déplacées**
vers `memory/archive/market-watch.md` — jamais supprimées (cf. `memory/process.md` § Rotation
de la mémoire). On garde ici une table active courte.

| Date | Source (URL) | Confiance | Observation | Catégorie |
| ---- | ------------ | --------- | ----------- | --------- |

## Analyses spécialisées

Benchmarks détaillés servant de **preuves** aux observations ci-dessus. Renseignés par les
agents spécialisés, sourcés et datés. L'`@ailed-analyst` s'y réfère pour dériver des sujets ;
ces sections **n'écrivent jamais** dans la roadmap.

### SEO / ASO

Maintenu par `@ailed-seo-aso` (audit interne + gaps vs concurrence). `—` si l'intégration est inactive.

| Date | Type (SEO/ASO) | Mot-clé / actif | Nous | Meilleur concurrent | Source (outil/URL) | Opportunité |
| ---- | -------------- | --------------- | ---- | ------------------- | ------------------ | ----------- |

### Monétisation

Maintenu par `@ailed-monetization` (modèle en place vs concurrence). `—` si la veille est inactive.

| Date | Acteur | Modèle | Palier / prix | Packaging | Source (URL) | Écart vs nous |
| ---- | ------ | ------ | ------------- | --------- | ------------ | ------------- |

## Backlog de sujets candidats

Dérivé par `@ailed-analyst` des observations **vérifiées** (toutes catégories confondues,
y compris `seo`/`aso`/`monetization`) et des analyses spécialisées. Scores 1-5.
Statut : `candidat` · `écarté (raison)` · `validé→brainstorm`.
**Seul un humain** fait passer un sujet à `validé→brainstorm` ; il entre alors dans le workflow Feature.

| ID | Sujet | Hypothèse de valeur | Preuves (réf. obs.) | Impact | Effort | Alignement | Confiance | Statut |
| -- | ----- | ------------------- | ------------------- | ------ | ------ | ---------- | --------- | ------ |
