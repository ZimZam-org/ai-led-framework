# Kanban

Last Updated: {{DATE}}

Statuts : `TO_CHECK` · `TODO` · `IN_PROGRESS` · `TO_TEST` · `DONE`.
Convention d'ID des tickets de dev : `{{TICKET_PREFIX}}-000001`, `{{TICKET_PREFIX}}-000002`, … (le préfixe `{{TICKET_PREFIX}}` est le trigramme du projet, défini dans `memory/config.md`)
Les tickets de clarification (`TO_CHECK`) portent un préfixe `CK-`.

Ce kanban ne garde **inline que les tickets vivants** (`TO_CHECK`→`TO_TEST`) et les `DONE`
**pas encore livrés**. À la release, `@ailed-release` **archive** les tickets `DONE` embarqués
vers `memory/archive/kanban.md`, une fois leur fonctionnalité captée dans `memory/features.md`
(cf. « Rotation & nettoyage de la mémoire » dans `memory/process.md`) — d'où la ligne
`> Archives : memory/archive/kanban.md` en tête dès qu'une archive existe. Ainsi les lectures
d'agents restent légères. Maintenu par `@ailed-pm` / `@ailed-planner` / `@ailed-release`.

Colonne **EPIC** : EPIC de rattachement (`memory/epics.md`). Colonne **Solution(s)** : `ID court`
des cibles impactées (registre `memory/architecture.md`).

**Poids d'une cellule : {{MAX_CELL_BYTES}} octets au maximum.** Une cellule plus grosse est une
spécification : son détail — analyse, inventaire, protocole de test, historique — vit dans
`memory/specs/` et la cellule y renvoie. **Ce fichier est un tableau, pas un journal** : un récit
d'EPIC ou un rapport de revue va dans `memory/specs/`, l'historique d'un livré dans
`memory/archive/kanban.md`.

Une mise à jour se fait **en place** : on corrige la cellule, on n'ajoute pas un commentaire daté
de plus sous le tableau. Sans ces règles, un kanban de 85 tickets atteint 300 Ko. Un agent paie
alors ~79 000 tokens par lecture.

Un constat **non demandé** (dette, bug mineur, idée) ne rentre pas ici : il va dans
`memory/observations.md` (cf. `memory/process.md` § Constats non demandés).

| ID | Date création | Status | EPIC | Titre | Description | Solution(s) | Détail technique | Maquette |
| -- | ------------- | ------ | ---- | ----- | ----------- | ----------- | ---------------- | -------- |


## Backlog de développement (tickets {{TICKET_PREFIX}}-*)

Découpés par `@ailed-planner` depuis `memory/epics.md`. Chaque ticket : indépendant, testable, réalisable en **une seule MR**. Critères d'acceptation hérités de la SPEC.
Statut initial : `TODO`. Convention de branche : `feat/{{TICKET_PREFIX}}-00000X-...`.

### EPIC-1 — Fondations app
| ID | Date création | Status | EPIC | Titre | Description | Solution(s) | Détail technique | Maquette |
| -- | ------------- | ------ | ---- | ----- | ----------- | ----------- | ---------------- | -------- |
