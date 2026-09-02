---
name: ailed-screens
description: Capture les écrans réellement impactés par un dev et les assemble en une planche HTML autonome (desktop + mobile, une prise de vue par état) pour une relecture humaine rapide du wording, du style et du comportement obtenu. Éphémère, non versionnée, jamais analysée par l'agent.
---

# Skill — ailed-screens

## Objectif
Fermer la boucle de `@ailed-dev` : donner à l'humain, **en fin de développement**, une seule page
à ouvrir montrant les écrans touchés par le ticket **tels qu'ils rendent vraiment** — wording,
style, états obtenus.

Ce n'est **ni un test, ni une preuve d'acceptation** : aucun verdict n'est produit, l'agent ne
relit pas les images, rien n'est versionné et rien ne bloque le workflow.

## Paramètres
- `ticket` : identifiant du ticket. Défaut : celui déduit du nom de la branche courante.
- `viewports` (optionnel) : défaut `desktop:1280x800, mobile:390x844`.
- `url` (optionnel) : URL de base de l'app. Défaut : `memory/config.md` § *Application locale*.
- `yes` (optionnel) : saute la confirmation de la liste de prises de vue.

## Comportement

### 1. Établir la liste de prises de vue (écran × état)
- **Écrans** : déduits du diff de la branche (`git diff --name-only <base>...HEAD`), en remontant
  des fichiers modifiés vers les pages/routes qui les rendent.
- **États** : déduits des **critères d'acceptation** du ticket (`memory/kanban.md`, la SPEC liée,
  ou l'issue tirée de l'outil de ticketing si `Ticketing externe` ≠ `{{DISABLED}}`) — par exemple
  liste vide, liste chargée, champ invalide, action confirmée, erreur serveur.
- **Afficher la liste proposée et attendre la validation humaine avant toute capture** (sauf
  `yes`). L'heuristique fichier → route est faillible : composant partagé par plusieurs écrans,
  routing dynamique, modale sans URL propre. L'humain ajoute ou retire des lignes ; c'est le
  seul moment où il intervient.

### 2. Vérifier les pré-requis d'exécution
- App démarrée et joignable sur l'URL de base ; MCP `chrome-devtools` disponible.
- Si l'app ne répond pas ou si le MCP est absent : **ne pas échouer**. Signaler le pré-requis
  manquant, rappeler la commande de démarrage (§ *Application locale* de `memory/config.md`)
  et s'arrêter proprement — le dev n'est pas bloqué pour autant.

### 3. Capturer
Pour chaque prise de vue : atteindre l'état (navigation, authentification si un compte de test est
renseigné, interactions), puis capturer **un screenshot par viewport** via le MCP `chrome-devtools`.
Relever au passage les erreurs console rencontrées. Une prise de vue inatteignable est **notée
comme telle** dans la planche, sans interrompre les suivantes.

### 4. Assembler la planche
Un **fichier HTML autonome** dans `.ailed/screens/<ticket>_<AAAAMMJJhhmmss>.html` :
- une carte par écran, une ligne par état, **desktop et mobile côte à côte** ;
- **images inlinées en base64** — la planche s'ouvre et se partage seule, sans dossier d'images ;
- légende de chaque prise de vue : écran + route + état capturé (et le critère d'acceptation dont
  l'état est issu, quand il en vient un) ;
- en pied de page : les erreurs console relevées et les prises de vue non atteintes.

### 5. Rendre la main
Afficher le chemin `file://…` à ouvrir. **Ne pas relire les images** : elles sont destinées à
l'œil humain, pas au jugement de l'agent — c'est ce qui rend la skill quasi gratuite en tokens.

## Pré-requis
- MCP/skill **`chrome-devtools`** disponible dans l'environnement Claude Code cible.
- `memory/config.md` § **Application locale** renseigné (URL de base au minimum).
  Tant que l'URL vaut `à renseigner`, **demander la valeur à l'humain puis la réécrire dans
  `config.md`** — on ne capture jamais sur une cible devinée.

## Ce que la skill ne fait pas
- Elle ne juge pas et ne compare pas à une maquette → `/ailed-mockup-preview` pour le rendu de la
  maquette UX, avant le dev.
- Elle ne produit aucun `PASS`/`FAIL` et n'entre dans aucune quality gate → `@ailed-test`.
- Elle n'écrit rien dans `memory/` ni dans git : `.ailed/` est ignoré par git et peut être vidé à
  tout moment sans perte.

## Exemple d'utilisation
> `/ailed-screens --ticket {{TICKET_PREFIX}}-000012`
> → liste de prises de vue proposée, validée par l'humain, puis
> `.ailed/screens/{{TICKET_PREFIX}}-000012_20260902143012.html` à ouvrir au navigateur.

## Artefacts mis à jour
Aucun artefact versionné. Une planche HTML éphémère sous `.ailed/screens/`.
