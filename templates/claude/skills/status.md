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
npx @s2bp/ai-led-framework status --html          # rapport vivant, nom stable
npx @s2bp/ai-led-framework status --html --live   # + régénération dès que memory/ bouge
```

Elle génère `ailed-status.html` (ouvrable dans le navigateur, aucun serveur, aucune donnée
envoyée) avec, en une page :
- un **chapô** : extrait borné (texte brut) de « État actuel » de `project-state.md`, l'intégralité
  étant rendue dans une popup (« Read the full state ») ;
- deux **camemberts** : avancement global (tickets DONE / total) et avancement **approximatif**
  du **jalon en cours** (tickets des EPICs rattachées au jalon) ;
- trois compteurs d'action : **bugs à traiter** (registre `incidents.md`), **vulnérabilités ouvertes**
  (`security.md`) et **sujets en attente d'arbitrage produit** (candidats `market-watch.md`, discovery → roadmap) ;
- une **timeline chronologique des EPICs** dont chaque nœud est un **camembert d'avancement**
  (part de ses tickets `DONE`, en % et en `n/total`) — un cercle vide ne dit pas où en est une
  EPIC en cours. Une EPIC sans ticket rattaché affiche « no ticket » plutôt qu'un faux 0 % ;
- un **board kanban** : une colonne par statut non-`DONE` (`TO_CHECK` · `TODO` · `IN_PROGRESS` ·
  `TO_TEST`, plus `Superseded`/`Other` si la mémoire en contient), et en dernière colonne les
  **5 dernières tâches `DONE`**. Chaque carte affiche **jalon → EPIC → ID → titre** (plus un
  compteur `▣ n` si des écrans ont été capturés) et s'ouvre en popup.

### Popup d'un ticket : historique + écrans validés
La popup d'une carte donne, sous sa description :
- un **historique daté** — création (colonne `Date création` du kanban), passage en
  développement, passage en test, finalisation — avec le **temps écoulé** entre étapes et le
  **lead time** total. Les dates viennent de `.ailed/journal.jsonl`, alimenté par le hook
  runtime **à chaque écriture de `memory/kanban.md`** : rien à renseigner à la main, et une
  étape non enregistrée est affichée comme telle plutôt que devinée ;
- les **captures d'écran** produites par `/ailed-screens` à l'étape de test
  (`.ailed/screens/<ticket>/<horodatage>/`), groupées par écran × état, desktop et mobile côte
  à côte, avec le critère d'acceptation d'origine ; clic = plein écran. Les prises de vue
  **non atteintes** et les erreurs console relevées sont listées dessous.

Les tickets archivés (`memory/archive/kanban.md`) sont **inclus** dans les compteurs et les
popups — sinon les EPICs livrées paraissent vides et l'avancement est sous-estimé.
Le détail brut de la mémoire reste accessible, replié, en bas de page. La variante `status` sans
option imprime un snapshot en terminal, sans consommer de tokens.

### Rapport vivant plutôt qu'horodaté
Le rapport porte un **nom stable** : on le garde ouvert dans un onglet, on le met en marque-page,
et il **se redessine seul** dès que les données changent — scroll et popup ouverte conservés.
La coquille HTML (~70 Ko) est séparée de sa charge utile (`.ailed/status/data.js`), rechargée par
balise `<script>` et non par `fetch()` — seule façon de recharger à chaud en `file://` sans
serveur. Les captures restent des **PNG sur disque référencés en relatif** : les inliner ferait
grossir le rapport d'environ 300 Ko par prise de vue.

Pour **partager** une revue, `--snapshot` fait l'inverse à la demande : un fichier horodaté
100 % autonome, captures inlinées, qui s'envoie tel quel. Et `npx @s2bp/ai-led-framework clean`
borne ce que le runtime laisse sur disque (planches antérieures, journal compacté) sans toucher
à quoi que ce soit de versionné.

## Exemple d'utilisation
> « /ailed-status » → affiche l'état consolidé du projet + la liste « À surveiller ».

## Artefacts mis à jour
Aucun (lecture seule).

{{WRITING_RULES}}
