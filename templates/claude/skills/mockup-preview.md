---
name: ailed-mockup-preview
description: Rend la maquette HTML dans un navigateur et capture des screenshots (desktop + mobile) pour faciliter la validation humaine. S'appuie sur le MCP chrome-devtools quand il est disponible.
---

# Skill — ailed-mockup-preview

## Objectif
Fermer la boucle de l'agent UX : **rendre visuellement** la maquette finale et fournir des
**screenshots** à l'humain pour la validation obligatoire, plutôt que de le laisser ouvrir le
fichier à la main.

## Paramètres
- `feature` : domaine_feature (localise `memory/ux/<feature>_<date>.html`).
- `viewports` (optionnel) : défaut `desktop:1280x800, mobile:390x844`.

## Comportement
1. Localiser la maquette active : `memory/ux/<feature>_<date>.html`.
2. **Rendu** via le skill/MCP natif **`chrome-devtools`** s'il est disponible :
   - ouvrir le fichier, capturer un screenshot par viewport ;
   - relever les erreurs console et les avertissements d'accessibilité.
3. **Auto-revue qualité** sur le rendu (pas seulement le code) :
   - hiérarchie visuelle, alignement, espacements cohérents avec `ailed-design-system` ;
   - contraste réel, focus visible, débordements/troncatures, responsive sans casse.
4. Présenter les screenshots + la liste des écarts détectés pour la **validation humaine**.

## Pré-requis
- MCP/skill **`chrome-devtools`** disponible dans l'environnement Claude Code cible.
  S'il est absent, **ne pas échouer** : signaler que le rendu automatique est indisponible,
  fournir le chemin du fichier à ouvrir manuellement et dérouler quand même l'auto-revue qualité
  sur le code (contraste des tokens, sémantique, responsive).

## Exemple d'utilisation
> `/ailed-mockup-preview --feature catalogue_enigmes`
> → screenshots desktop + mobile + rapport d'écarts pour validation.

## Artefacts mis à jour
Screenshots de prévisualisation (à côté de `memory/ux/`), aucune modification de la maquette.

{{WRITING_RULES}}
