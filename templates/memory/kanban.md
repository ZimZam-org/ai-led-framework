# Kanban

Last Updated: YYYY-MM-DD

Statuts : `TO_CHECK` · `TODO` · `IN_PROGRESS` · `TO_TEST` · `DONE`.
Convention d'ID des tickets de dev : `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, … (le préfixe `{{TICKET_PREFIX}}` est le trigramme du projet, défini dans `memory/config.md`)
Les tickets de clarification (`TO_CHECK`) portent un préfixe `CK-`.
Les tickets intégrés dans une release peuvent être supprimés. Maintenu par `@ailed-pm` / `@ailed-planner`.

| ID | Date création | Status | Titre | Description | Détail technique | Maquette |
| -- | ------------- | ------ | ----- | ----------- | ---------------- | -------- |


## Backlog de développement (tickets {{TICKET_PREFIX}}-*)

Découpés par `@ailed-planner` depuis `memory/epics.md`. Chaque ticket : indépendant, testable, réalisable en **une seule MR**. Critères d'acceptation hérités de la SPEC.
Statut initial : `TODO`. Convention de branche : `feat/{{TICKET_PREFIX}}-00000X-...`.

### EPIC-1 — Fondations app
| ID | Date création | Status | Titre | Description | Détail technique | Maquette |
| -- | ------------- | ------ | ----- | ----------- | ---------------- | -------- |
