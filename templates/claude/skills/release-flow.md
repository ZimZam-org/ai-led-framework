---
name: ailed-release-flow
description: Orchestre une release : quality gates, tag Git, release notes et clôture des tickets embarqués.
---

# Skill — ailed-release-flow

## Objectif
Orchestrer une release : quality gates, tag, release notes, clôture des tickets.

## Paramètres
- `version` : numéro de version (semver, ex. `0.1.0`).

## Étapes
1. Vérifier les quality gates (skill `ailed-quality-gate`) sur tous les tickets embarqués.
2. Mettre à jour `changelog.md` (via `@ailed-communication`).
3. Créer le tag Git `vX.Y.Z`.
4. Générer les release notes.
5. Clôturer les tickets et barrer le jalon dans la roadmap.
6. **Validation humaine** avant publication du tag.

## Exemple
```bash
git tag -a v0.1.0 -m "MVP jouable"
```

## Artefacts mis à jour
`changelog.md`, `memory/roadmap.md`, `memory/project-state.md`, `memory/kanban.md`.
