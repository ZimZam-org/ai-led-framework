---
name: ailed-git-flow
description: Standardise le flux Git : branches par ticket, Conventional Commits et ouverture de MR. À utiliser avant tout commit.
---

# Skill — ailed-git-flow

## Objectif
Standardiser le flux Git : branches, commits et MR pour un ticket.

## Paramètres
- `ticket` : identifiant (ex. `{{TICKET_PREFIX}}-000001`).
- `type` : `feat` | `fix`.
- `scope` (optionnel) : domaine touché.

## Règles
- Une branche par ticket : `feat/{{TICKET_PREFIX}}-000001-titre-court` ou `fix/...`.
- Commits en **Conventional Commits** : `feat(scope): message`.
- Une MR par ticket. Le dev ne fusionne jamais (constitution règle 4).

## Exemples
```bash
git checkout -b feat/{{TICKET_PREFIX}}-000001-catalogue-enigmes
git commit -m "feat(catalogue): ajoute la liste des défis"
gh pr create --base develop --fill
```

## Artefacts mis à jour
Branches, commits, MR.
