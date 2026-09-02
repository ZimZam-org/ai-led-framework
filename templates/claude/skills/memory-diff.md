---
name: ailed-memory-diff
description: Relecture des modifications apportées à memory/. Regroupe le diff git de la mémoire par section markdown (fichier → section → lignes), signale ce qui mérite un regard humain (section supprimée, décision écrasée, date non mise à jour) et produit un rapport HTML ou un collage en texte riche. Lecture seule, n'écrit jamais dans memory/.
---

# Skill — ailed-memory-diff

## Objectif
Les agents réécrivent `memory/` en continu. Avant qu'un humain valide une SPEC, un ADR ou une
release, la question utile n'est pas « que dit le fichier » mais **« qu'est-ce que l'agent a
changé, et où »**. Ce skill répond à ça : un **diff de la mémoire lisible**, groupé par section,
avec les points à surveiller. Strictement **lecture seule** : ne modifie aucun fichier.

## Entrées
- l'historique git du dépôt (les fichiers `memory/*.md` versionnés) ;
- `memory/config.md` pour le trigramme de ticket (rattachement des lignes aux tickets) ;
- au besoin : `memory/process.md` (quels points de validation humaine sont concernés).

## Déroulé
1. **Lancer la commande déterministe d'abord** — elle fait tout le travail de collecte, sans
   consommer de tokens :

   ```bash
   npx @s2bp/ai-led-framework memory-diff                            # HEAD → copie de travail
   npx @s2bp/ai-led-framework memory-diff --since=HEAD~1 --until=HEAD  # le dernier commit
   npx @s2bp/ai-led-framework memory-diff --since=develop           # tout l'écart de la branche
   ```

   Elle sort, par fichier : les compteurs `+/-`, les **sections markdown** touchées avec leurs
   lignes, les **tickets** concernés, et une liste de **points à surveiller** (section supprimée,
   `Last Updated` non mis à jour, fichier `memory/` non commité).

   Deux cas sont **résumés au lieu d'être dépliés**, parce que tout y serait « + » et que le
   déplier noierait le rapport : un fichier **entièrement nouveau** de plus de 60 lignes (une SPEC
   fraîche fait des milliers de lignes) — rendu par sa **table des matières** — et un fichier
   **non markdown** de `memory/` (une maquette HTML de `@ailed-ux`), rendu par son seul volume.
   Ajouter `--full` les déplie. **Pour relire une SPEC nouvelle, ouvrir le fichier**, pas le diff :
   le rapport dit qu'elle est arrivée et ce qu'elle contient, c'est son rôle.

2. **Ne pas relire les fichiers entiers.** Le diff suffit ; ouvrir `memory/*.md` en entier coûte
   des tokens pour une information que la commande a déjà extraite. N'ouvrir un fichier que si une
   ligne du diff est ambiguë sans son contexte immédiat.

3. **Interpréter** — c'est la valeur ajoutée par rapport à `git diff` :
   - **Quoi** : pour chaque fichier, une phrase de ce qui a réellement changé (nouveau ticket,
     changement de statut, ADR ajouté, risque retiré, jalon déplacé…).
   - **Cohérence entre fichiers** : un ticket passé `DONE` dans `kanban.md` sans entrée dans
     `features.md` ; un ADR ajouté dans `decisions.md` sans impact reporté dans `architecture.md` ;
     une EPIC fermée dans `epics.md` avec des tickets encore ouverts.
   - **Régressions de mémoire** : contenu **supprimé** sans archivage (`memory/archive/`),
     décision réécrite au lieu d'être remplacée par un nouvel ADR, valeur remplacée par un
     `TO IDENTIFY` / `TODO` — un agent qui perd de l'information est un incident, pas un détail.
   - **Contenu inventé** : chiffre, date ou source apparus sans ticket ni observation qui les
     porte. À signaler comme **à vérifier**, jamais à corriger soi-même.
   - **Validation humaine** : quels points de `memory/process.md` ces changements engagent
     (SPEC à valider, maquette à valider, sujet de veille à arbitrer).

4. **Conclure par un verdict court** : `RAS` · `à vérifier` · `à corriger`, avec la liste des
   points bloquants. Ne jamais dire « conforme » si un point est resté ouvert.

## Rapport pour un humain
Quand la relecture doit sortir de la session (validation par un tiers, revue de MR, compte rendu) :

```bash
npx @s2bp/ai-led-framework memory-diff --html    # rapport HTML autonome (aucun CDN, aucune donnée envoyée)
npx @s2bp/ai-led-framework memory-diff --clip    # même rapport en texte riche dans le presse-papiers
```

- `--html` écrit `<horodatage>_ailed-memory-diff.html` : page statique, ouvrable et archivable
  telle quelle, thème clair/sombre selon le système.
- `--clip` charge le rapport en `text/html` dans le presse-papiers : il se colle **formaté** dans
  Teams / Slack / Outlook / Confluence, qui n'acceptent pas le markdown. Backends `wl-copy`
  (Wayland), `xclip` (X11), `osascript` (macOS) ; sans backend, la commande le dit au lieu de
  coller du HTML brut.

## Style de sortie
Respecter le **Style de sortie** de `memory/config.md` (`concis` · `standard` · `détaillé`) :
- `concis` : le verdict, puis une puce par fichier changé et la liste des points à vérifier.
  Aucun préambule, pas de recopie du diff que la commande a déjà affiché.
- `standard` : l'interprétation décrite ci-dessus.
- `détaillé` : ajouter, pour chaque point à vérifier, le fichier, la section et la ligne concernée.

Quel que soit le style, **ne jamais omettre** une suppression de contenu, une incohérence entre
fichiers ou un chiffre non sourcé.

## Règles
- **Lecture seule** : ne jamais écrire dans `memory/`, ne jamais « réparer » un diff. Les
  corrections passent par l'agent propriétaire du fichier (`@ailed-pm`, `@ailed-architect`,
  `@ailed-planner`, `@ailed-release`).
- **La commande d'abord** : ne pas reconstruire le diff à la main avec `git diff` + lecture de
  fichiers, c'est le même résultat pour beaucoup plus de tokens.
- Si `memory/` est absent : indiquer de lancer `npx @s2bp/ai-led-framework init`.
- Si le dépôt n'est pas git ou si `memory/` n'a jamais été commité : le dire et proposer
  `git add memory/ && git commit` — sans référence de départ, il n'y a rien à comparer.
- Si le diff est vide : le dire en une ligne et proposer `--since=HEAD~1 --until=HEAD` pour
  relire le dernier commit.

## Exemple d'utilisation
> « /ailed-memory-diff » → « 3 fichiers changés. `kanban.md` : {{TICKET_PREFIX}}-000012 passe `TO_TEST`.
> `decisions.md` : ADR-004 ajouté (Redis pour les sessions) — **non reporté dans
> `architecture.md`**. `project-state.md` : section « Risques observés » **supprimée sans
> archivage**. Verdict : à corriger (2 points). »

## Artefacts mis à jour
Aucun dans `memory/` (lecture seule). Produit éventuellement un rapport HTML à la racine du projet.
