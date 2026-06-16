---
name: ailed-adr
description: Crée une décision d'architecture (ADR) normalisée et numérotée dans memory/decisions.md. À utiliser pour toute décision technique structurante.
---

# Skill — ailed-adr

## Objectif
Créer une décision d'architecture (ADR) normalisée dans `memory/decisions.md`.

## Paramètres
- `titre` : intitulé de la décision.
- `contexte`, `decision`, `alternatives`, `impact`.

## Format
```markdown
## ADR-NNNN — <titre>
- Date :
- Agent :
- Contexte :
- Décision :
- Alternatives :
- Impact :
```

## Règles
- Numérotation incrémentale, ordre anti-chronologique (récent en haut).
- Aucune suppression d'ADR existant.

## Exemple
> « Crée un ADR pour le choix de la stack mobile » → ajoute `ADR-0002` en tête.

## Artefacts mis à jour
`memory/decisions.md`.
