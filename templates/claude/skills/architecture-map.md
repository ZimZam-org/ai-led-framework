---
name: ailed-architecture-map
description: Génère ou met à jour la cartographie d'architecture (diagrammes Mermaid) dans memory/architecture.md à partir du code et de la configuration.
---

# Skill — ailed-architecture-map

## Objectif
Générer / mettre à jour la cartographie d'architecture (diagrammes Mermaid) dans
`memory/architecture.md`.

## Paramètres
- `scope` : applicatif | infrastructure | données | intégrations.

## Comportement
- Inspecte le code et la configuration existants.
- Produit ou met à jour un diagramme Mermaid correspondant.
- Signale les zones inconnues.

## Exemple
```mermaid
graph TD
    UI[App mobile] --> API[API]
    API --> DB[(DB)]
```

## Artefacts mis à jour
`memory/architecture.md`.
