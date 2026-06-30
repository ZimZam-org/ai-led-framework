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

## Style de sortie
Respecter le **Style de sortie** de `memory/config.md` (`concis` · `standard` · `détaillé`) :
- `concis` : aller droit au but. Ouvrir directement sur l'avancement (`X/Y tickets DONE`) et
  le compteur kanban, puis la liste « À surveiller ». Que des puces courtes, aucun préambule,
  aucune phrase de transition, pas de reformulation des sections vides (les omettre ou « — »).
- `standard` : la synthèse structurée décrite ci-dessus.
- `détaillé` : ajouter le détail des tickets en cours, les prochains jalons et les risques.

Quel que soit le style, **ne jamais omettre** un blocage, une validation humaine en attente ou
un risque : la concision coupe le superflu, pas le fond.

## Règles
- **Lecture seule** : ne jamais écrire dans `memory/`.
- Si `memory/` est absent : indiquer de lancer `npx @s2bp/ai-led-framework init`.
- Si la mémoire est vide / non initialisée (`TO IDENTIFY`, `TODO`) : suggérer `@ailed-init-memory`.
- Signaler honnêtement les sections vides plutôt que d'inventer du contenu.

## Vue navigateur (sans serveur)
Pour un tableau de bord **visuel**, proposer la commande déterministe :

```bash
npx @s2bp/ai-led-framework status --html
```

Elle génère `ailed-status.html` (fichier statique ouvrable dans le navigateur, aucun serveur,
aucune donnée envoyée) avec, en une page :
- deux **camemberts** : avancement global (tickets DONE / total) et avancement **approximatif**
  du **jalon en cours** (tickets des EPICs rattachées au jalon) ;
- trois compteurs d'action : **bugs à traiter** (registre `incidents.md`), **vulnérabilités ouvertes**
  (`security.md`) et **sujets en attente d'arbitrage produit** (candidats `market-watch.md`, discovery → roadmap) ;
- une **timeline chronologique des EPICs** (traitées · en cours · à venir) ;
- le **détail de l'EPIC en cours** : tâches terminées · en cours · à venir.

Le détail brut de la mémoire reste accessible, replié, en bas de page. La variante `status` sans
option imprime un snapshot en terminal, sans consommer de tokens.

## Exemple d'utilisation
> « /ailed-status » → affiche l'état consolidé du projet + la liste « À surveiller ».

## Artefacts mis à jour
Aucun (lecture seule).
