---
name: ailed-status
description: Tableau de bord du projet. Agrège l'état (project-state, roadmap, kanban, features, veille, process) en une synthèse lisible et remonte ce qui demande une action. Lecture seule, n'écrit jamais dans memory/.
---

# Skill — ailed-status

## Objectif
Donner une **vue d'ensemble claire** de l'état du projet à partir de la mémoire, et surtout
remonter **ce qui demande une décision ou une action**. Strictement **lecture seule** :
ne modifie aucun fichier.

## Entrées (`memory/`, dans la langue du projet)
- `project-state.md`, `roadmap.md`, `kanban.md`, `epics.md`, `features.md`
- `market-watch.md`, `process.md`, `config.md`
- au besoin : `decisions.md`, `incidents.md`, `security.md`, `context.md`

## Déroulé
1. Lire les fichiers ci-dessus présents dans `memory/`.
2. Produire une **synthèse structurée** :
   - **En-tête** : nom / trigramme du projet et intégrations actives vs désactivées (`config.md`).
   - **État** : résumé de `project-state.md` (état actuel, avancement, risques).
   - **Roadmap** : jalons et prochaines étapes.
   - **Kanban** : compteur par statut (`TO_CHECK` / `TODO` / `IN_PROGRESS` / `TO_TEST` / `DONE`)
     et tickets en cours.
   - **Veille** : fraîcheur de `market-watch.md`, nb d'observations vérifiées, **sujets candidats
     en attente de promotion**.
   - **Fonctionnalités** : ce qui est livré (`features.md`).
3. Terminer par une section **« À surveiller »** :
   - validations humaines en attente (sujets candidats, SPEC/maquette non validées) ;
   - fichiers périmés selon `Last Updated` (veille > ~1 mois, autres > ~2 mois) ;
   - intégrations désactivées ; tickets bloqués / clarifications `TO_CHECK` ouvertes.

## Règles
- **Lecture seule** : ne jamais écrire dans `memory/`.
- Si `memory/` est absent : indiquer de lancer `npx @s2bp/ai-led-framework init`.
- Si la mémoire est vide / non initialisée (`TO IDENTIFY`, `TODO`) : suggérer `@ailed-init-memory`.
- Signaler honnêtement les sections vides plutôt que d'inventer du contenu.

## Vue navigateur (sans serveur)
Pour un tableau de bord **visuel** (kanban en colonnes, roadmap, diagrammes du process),
proposer la commande déterministe :

```bash
npx @s2bp/ai-led-framework status --html
```

Elle génère `ailed-status.html` (fichier statique ouvrable dans le navigateur, aucun serveur,
aucune donnée envoyée). La variante `status` sans option imprime le même snapshot en terminal,
sans consommer de tokens.

## Exemple d'utilisation
> « /ailed-status » → affiche l'état consolidé du projet + la liste « À surveiller ».

## Artefacts mis à jour
Aucun (lecture seule).
