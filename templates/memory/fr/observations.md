# Observations

Last Updated: {{DATE}}

Journal des **constats non demandés** : dette technique, bug mineur, idée d'évolution,
manque de documentation, question ouverte. Un agent qui remarque quelque chose hors de sa
mission l'écrit **ici**, jamais dans `memory/kanban.md`.

Ce fichier n'est **pas un backlog**. C'est le pendant technique de `memory/market-watch.md` :
on capture largement, on engage peu. Le kanban ne contient que ce qu'un humain a décidé
de faire.

## Ce qui entre où

| Constat | Destination |
| ------- | ----------- |
| Demandé explicitement par un humain | `memory/kanban.md` (ticket) |
| Sévérité `CRITICAL` ou `HIGH` (sécurité, perte de données, production cassée) | `memory/kanban.md` (ticket) + ce fichier |
| Tout le reste | ce fichier **uniquement** |

## Cycle de vie

- **Statuts** : `ouvert` · `promu` (devenu un ticket) · `écarté` (décision humaine) · `périmé`.
- **Promotion** : un humain seul promeut une observation en ticket. L'agent **propose**, il
  ne crée pas. La ligne passe alors `promu` et porte l'ID du ticket.
- **Péremption** : une observation `ouvert` de plus de **90 jours** passe `périmé`. Elle n'a
  pas été jugée assez importante en trois mois ; la garder ouverte ne dit plus rien.
- **Rotation** : les lignes `écarté` et `périmé` partent dans `memory/archive/observations.md`
  (cf. `memory/process.md` § Rotation). Le framework ne supprime rien.

## Registre

| Date | Source | Sévérité | Constat | Statut | Ticket |
| ---- | ------ | -------- | ------- | ------ | ------ |

> **Source** : l'agent ou la skill qui a fait le constat (`@ailed-dev`, `@ailed-review`, …).
> **Sévérité** : `CRITICAL` · `HIGH` · `MEDIUM` · `LOW`. Seules les deux premières ouvrent
> aussi un ticket. **Constat** : une phrase, un fait, un chemin de fichier. Pas d'analyse —
> l'analyse vient au moment de la promotion, pas au moment de la capture.
