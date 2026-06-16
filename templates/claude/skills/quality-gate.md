---
name: ailed-quality-gate
description: Vérifie que tous les critères de clôture d'un ticket sont remplis avant fusion ou release.
---

# Skill — ailed-quality-gate

## Objectif
Vérifier que tous les critères de clôture d'un ticket sont remplis avant fusion/release.

## Paramètres
- `ticket` : identifiant du ticket évalué.

## Checklist
```text
✓ code compilable
✓ lint OK
✓ tests OK
✓ review PASS
✓ test PASS
✓ documentation mise à jour
✓ changelog mis à jour
✓ feature list mise à jour
✓ MR créée
✓ validation humaine
```

## Exemple d'utilisation
> « Applique la quality-gate sur {{TICKET_PREFIX}}-000001 » → produit le statut de chaque critère
> et bloque si l'un échoue.

## Artefacts mis à jour
`memory/kanban.md` (statut du ticket), rapport de gate.
