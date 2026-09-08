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
✓ rédaction conforme (ai-led lint)
✓ MR créée
✓ validation humaine
```

## Contrôle de rédaction
Le critère « rédaction conforme » s'obtient avec :

```bash
npx @s2bp/ai-led-framework lint
```

La commande vérifie les règles mesurables de `memory/writing-rules.md` sur `memory/`.
Une erreur bloque la gate. Un avertissement se corrige ou se justifie dans le rapport.
Si la norme vaut `{{DISABLED}}` dans `memory/config.md`, le critère ne s'applique pas.

## Exemple d'utilisation
> « Applique la quality-gate sur {{TICKET_PREFIX}}-000001 » → produit le statut de chaque critère
> et bloque si l'un échoue.

## Artefacts mis à jour
`memory/kanban.md` (statut du ticket), rapport de gate.

{{WRITING_RULES}}
