---
name: ailed-promo
description: Génère du contenu promotionnel (trailer, short, poster) à partir des release notes via l'outil configuré ({{PROMO}}).
---

# Skill — ailed-promo

## Objectif
Générer du contenu promotionnel (trailer, short, poster) à partir des release notes,
via l'outil de génération défini dans `memory/config.md` : **{{PROMO}}**.

## Paramètres
- `feature` ou `version` : sujet de la promo.
- `format` : `trailer` | `short` | `poster`.

## Comportement
- S'appuie sur les release notes produites par `@ailed-communication`.
- Produit les assets promo dans le format demandé via **{{PROMO}}**.

## Pré-requis
- Outil **{{PROMO}}** configuré. Si la valeur vaut `{{DISABLED}}`, indique que la génération
  promo n'est pas activée pour ce projet et arrête-toi.

## Exemple d'utilisation
> `/ailed-promo --version 0.1.0 --format trailer`

## Artefacts mis à jour
Assets promo générés (hors `memory/`).
