---
name: ailed-design-system
description: Établit un design system minimal (tokens, échelle typographique, grille, accessibilité) pour des wireframes et maquettes cohérents et soignés. À utiliser par @ailed-ux avant tout rendu HTML.
---

# Skill — ailed-design-system

## Objectif
Donner à l'agent UX une **base de design opinionée et cohérente** (tokens, typo, grille,
accessibilité) pour que chaque wireframe/maquette ait un rendu professionnel — sans réinventer
les fondamentaux à chaque feature.

## Paramètres
- `feature` : domaine_feature concerné (sert au nommage du fichier UX).
- `theme` (optionnel) : `light` | `dark` | `auto` (défaut `light`).

## Comportement
1. **Qualité visuelle** : déléguer le rendu haute-fidélité au skill natif **`frontend-design`**
   s'il est disponible (éviter l'esthétique « AI générique », soigner hiérarchie, espacement,
   couleur, micro-détails). À défaut, appliquer la baseline ci-dessous.
2. **Tokens CSS** : exposer les tokens via `:root { --... }` et n'utiliser que ces variables
   (jamais de valeurs en dur dans les composants).
3. **Cohérence** : réutiliser le même jeu de tokens entre les 3 variantes et la maquette finale.

### Baseline (à défaut de `frontend-design`)
```css
:root {
  /* Couleur — 1 primaire + neutres, contraste AA garanti */
  --color-bg: #ffffff;        --color-surface: #f6f7f9;
  --color-text: #14171a;      --color-text-muted: #5b6470;
  --color-primary: #2f6feb;   --color-primary-contrast: #ffffff;
  --color-border: #e2e6ea;    --color-focus: #1a56db;
  /* Typo — échelle modulaire 1.25, system stack */
  --font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  --fs-xs: .75rem; --fs-sm: .875rem; --fs-md: 1rem; --fs-lg: 1.25rem;
  --fs-xl: 1.563rem; --fs-2xl: 1.953rem; --fs-3xl: 2.441rem;
  /* Espacement — base 4px */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-6:24px; --sp-8:32px; --sp-12:48px;
  --radius: 10px; --shadow: 0 1px 3px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06);
  --container: 1120px; /* grille 12 colonnes, gutter --sp-6 */
}
```

## Accessibilité (non négociable)
- Contraste texte/fond **≥ 4.5:1** (≥ 3:1 pour le gros texte) — vérifier les couples token.
- Cibles tactiles **≥ 44×44px** ; `:focus-visible` toujours visible (`--color-focus`).
- HTML sémantique (`header/nav/main/section/button`), `alt` sur les images, labels sur les champs.
- Respecter `prefers-reduced-motion` et `prefers-color-scheme` si `theme: auto`.

## Exemple d'utilisation
> `/ailed-design-system --feature catalogue_enigmes --theme auto`
> → tokens + règles d'accessibilité injectés dans le `<head>` des wireframes et de la maquette.

## Artefacts mis à jour
Bloc de tokens/styles partagé, réutilisé dans `memory/ux/*.html`.

{{WRITING_RULES}}
