---
name: ailed-quality-gate
description: Vérifie que tous les critères de clôture d'un ticket sont remplis avant fusion ou release, contrat de frontières et modèle de contexte compris.
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
✓ modèle de contexte VALIDATED
✓ frontières OK : aucune violation absente de la baseline
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

## Contrôle du modèle de contexte
Le ticket nomme son contexte dans la cellule `Détail technique` de `memory/kanban.md`. Le
critère « modèle de contexte VALIDATED » s'obtient quand `memory/contexts/<contexte>.md` porte
ce statut. Un ticket sans contexte dans cette cellule échoue le critère.

## Contrôle des frontières
1. Lire l'outil, le contrat et la baseline dans la colonne `Contrat de frontières` du registre
   de `memory/architecture.md`, pour la solution du ticket.
2. Lancer l'outil sur le dépôt avec le contrat.
3. Comparer chaque violation à la baseline. Une violation absente de la baseline bloque la
   gate ; le rapport la cite avec son fichier et sa règle.

Quand la solution attend encore son outil (ADR `provisoire`), le critère bloque jusqu'à ce que le
premier ticket du contexte installe l'outil et confirme l'ADR.

## Exemple d'utilisation
> « Applique la quality-gate sur {{TICKET_PREFIX}}-000001 » → produit le statut de chaque critère
> et bloque si l'un échoue.

## Artefacts mis à jour
`memory/kanban.md` (statut du ticket), rapport de gate.

{{WRITING_RULES}}
