# Architecture

Last Updated: {{DATE}}

## Solutions / cibles déployables

> Registre des solutions livrables du projet (**source de vérité**). En monorepo, lister
> chaque cible : app mobile, backoffice web, site institutionnel, packages partagés…
> L'`ID court` (ex. `mobile`, `backoffice`, `site`) sert de **tag** réutilisé dans
> `roadmap.md`, `epics.md` et `kanban.md`. Maintenu par `@ailed-architect` / `@ailed-init-memory`.

| ID court | Type | Stack | Description | Domaines (DDD) | Contrat de frontières |
| -------- | ---- | ----- | ----------- | -------------- | --------------------- |

### Découpage en domaines métier (DDD)

> Renseigné par `@ailed-architect` pour toute SPEC qui crée un module ou restructure une zone.
> Chaque bounded context a son modèle dans `memory/contexts/<contexte>.md` (`/ailed-context-model`).
> La colonne `Domaines (DDD)` du registre pointe vers ce fichier. La colonne `Contrat de
> frontières` nomme l'outil retenu, son ADR et sa baseline : un outil par solution.
>
> **Validation humaine requise** : le modèle passe de `PROPOSED` à `VALIDATED`.
> Une cible partage un domaine avec d'autres cibles, ou le garde pour elle seule.
> Chaque itération enrichit l'existant. Un ADR trace toute refonte structurante.

#### Carte des contextes

> Un contexte par ligne, avec ses voisins et le port qui les relie. Sur un projet `brownfield`,
> l'ancien code est un contexte à part : chaque frontière avec lui porte la couche anti-corruption.
> `@ailed-init-memory` y liste les modules existants comme contextes candidats, confiance basse.

| Contexte | Modèle | Voisins (relation · port) | Couche anti-corruption | Confiance |
| -------- | ------ | ------------------------- | ---------------------- | --------- |

## Architecture applicative

TODO

## Décisions techniques (actées)

| Sujet | Décision | Réf. |
| ----- | -------- | ---- |

## Modèle de données

TODO

## Architecture infrastructure

TODO

## Bases de données

TODO

## APIs

TODO

## Intégrations externes

TODO
