# Veille concurrentielle & tendances

Last Updated: {{DATE}}

Source de vérité de la veille. Trois sections **étanches** : brut → candidat → promu.
Trois règles : chaque observation **porte sa source et sa date** ; la veille **n'écrit jamais**
dans `roadmap.md` ; un sujet quitte le backlog par **validation humaine** vers
`@ailed-brainstorm`. Cinq agents maintiennent ce fichier : `@ailed-scout`, `@ailed-seo-aso`,
`@ailed-monetization`, `@ailed-fact-check` et `@ailed-analyst`.

## Sources & cadence

- Canal de veille : voir `memory/config.md` (intégration **Veille**). `{{DISABLED}}` = veille inactive.
- Concurrents / flux suivis : TODO
- Cadence de rafraîchissement : TODO (ex. mensuelle)

## Observations brutes

`@ailed-scout`, `@ailed-seo-aso` et `@ailed-monetization` ajoutent les lignes.
`@ailed-fact-check` les vérifie. Confiance : `haute` / `moyenne` / `basse`.
Catégories : `feature`, `pricing`, `tendance`, `ux`, `seo`, `aso`, `monetization`.
Une observation perd un cran de confiance au-delà de 6 mois. Le délai est plus court pour
`seo`, `aso` et `monetization`, plus volatils.

Rotation : l'agent **déplace** vers `memory/archive/market-watch.md` les observations rejetées
(avec leur raison) et les observations décotées de plus de 6 mois. Il n'en supprime aucune
(voir `memory/process.md`, section « Rotation & nettoyage de la mémoire »).
La table active reste courte.

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
