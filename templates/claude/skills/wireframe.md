---
name: ailed-wireframe
description: Produit 3 variantes de wireframes lo-fi cohérentes et comparables à partir d'une SPEC, avec annotations avantages/inconvénients. À utiliser par @ailed-ux avant la maquette finale.
---

# Skill — ailed-wireframe

## Objectif
Standardiser la **phase exploratoire** de l'agent UX : 3 variantes lo-fi **réellement
différentes**, comparables, et chacune justifiée — pour rendre le choix humain rapide et éclairé.

## Paramètres
- `feature` : domaine_feature (nommage du fichier).
- `flows` : liste des parcours décrits dans la SPEC à couvrir.

## Comportement
1. S'appuyer sur **`ailed-design-system`** pour la grille et les tokens (cohérence inter-variantes).
2. Produire **3 variantes lo-fi** qui explorent des partis-pris *distincts* (pas 3 nuances) :
   - **A — Conventionnel** : disposition attendue, faible risque.
   - **B — Densité/efficacité** : optimise le parcours expert / la rapidité d'action.
   - **C — Guidé/progressif** : réduit la charge cognitive (étapes, défaut, onboarding).
3. Style lo-fi assumé : niveaux de gris, blocs, libellés — **pas** de couleur de marque ni d'images
   finales (réservées à la maquette). Annoter les zones interactives.
4. Couvrir **tous les `flows`** de la SPEC dans chaque variante (signaler tout parcours non couvert).

## Format de sortie (par variante)
```text
### Variante X — <nom>
[ wireframe HTML lo-fi ]
- Avantages    : …
- Inconvénients: …
- Parcours SPEC couverts : flow-1, flow-2, …
- Recommandé pour : <contexte>
```
Terminer par une **recommandation argumentée** d'UNE variante (ou hybridation) → entrée de
la maquette finale (`ailed-mockup-preview`).

## Quality gates
- 3 variantes présentées **avant** toute maquette finale (constitution UX).
- Chaque parcours de la SPEC couvert par au moins une variante.
- Accessibilité de base déjà respectée au stade lo-fi (structure sémantique, ordre de lecture).

## Exemple d'utilisation
> `/ailed-wireframe --feature catalogue_enigmes --flows "liste, filtre, détail"`

## Artefacts mis à jour
Variantes consignées dans le rendu UX (préliminaire à `memory/ux/<feature>_<date>.html`).
