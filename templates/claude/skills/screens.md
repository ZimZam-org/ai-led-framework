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
- **Écrans** : déduits du diff de la branche, en remontant des fichiers modifiés vers les
  pages/routes qui les rendent. **Résoudre `<base>` au lieu de la supposer** — `main` n'existe
  pas partout : prendre le premier candidat qui existe parmi
  `git symbolic-ref refs/remotes/origin/HEAD`, `main`, `master`, puis la branche de base
  déclarée dans `memory/conventions.md` / `memory/config.md`.

  ```bash
  git diff --name-only <base>...HEAD -- <chemin de l'app>
  ```

  **Si ce diff est vide, ne pas conclure « aucun écran touché »** : c'est le cas normal d'une
  branche déjà mergée ou d'un dossier applicatif que la branche ne touche pas. Se rabattre sur
  les derniers commits qui touchent réellement l'app (`git log --oneline -5 -- <chemin>`), en
  annonçant à l'humain le commit retenu comme périmètre. Ne s'arrêter qu'après cet essai, et en
  demandant le périmètre.
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
Relever au passage les erreurs console rencontrées (`list_console_messages`). Une prise de vue
inatteignable est **notée comme telle** dans la planche, sans interrompre les suivantes.

> **Toujours passer `filePath` à `take_screenshot`** — capturer vers un fichier, puis lire ce
> fichier pour l'inliner en base64 dans la planche. **Sans `filePath`, l'image est attachée à la
> réponse de l'outil** : elle entre dans le contexte de l'agent (ce que cette skill promet
> justement d'éviter) et le transfert **peut bloquer plusieurs minutes** sur une page un peu
> lourde. C'est le point le plus faillible de la skill : une capture qui coûte des tokens ou qui
> fige la session lui fait perdre sa raison d'être.

Séquence par prise de vue : `resize_page` (viewport) → `navigate_page` → interactions →
`take_screenshot(filePath: …)`. Grouper par viewport (redimensionner une fois, enchaîner les
routes) plutôt que de redimensionner à chaque prise.

### 4. Assembler la planche
Un **fichier HTML autonome** dans `.ailed/screens/<ticket>_<AAAAMMJJhhmmss>.html`. **Vérifier
d'abord que `.ailed/` est bien ignoré par git** (`git check-ignore -q .ailed/`) : les projets
installés avec une version antérieure du framework n'ont pas l'entrée, et la planche y laisserait
des fichiers non suivis dans `git status`. Si l'entrée manque, l'ajouter au `.gitignore` (ou
proposer `npx @s2bp/ai-led-framework update`, qui la câble) **avant** d'écrire la planche.

Contenu :
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
  `config.md`** — on ne capture jamais sur une cible devinée. Sur un projet installé avant
  l'arrivée de cette section, **elle est absente** : demander l'URL puis **créer la section**,
  ne pas échouer sur son absence.
- **Les écrans authentifiés sont le cas majoritaire** : sans compte de test, une app à login
  redirige toute route protégée vers la connexion. Capturer ce que l'app rend vraiment, puis
  marquer l'état visé comme **non atteint** en donnant la raison (compte de test manquant) —
  jamais présenter une redirection comme l'écran demandé.

## Ce que la skill ne fait pas
- Elle ne juge pas et ne compare pas à une maquette → `/ailed-mockup-preview` pour le rendu de la
  maquette UX, avant le dev.
- Elle ne produit aucun `PASS`/`FAIL` et n'entre dans aucune quality gate → `@ailed-test`.
- Elle ne produit **aucun artefact versionné** : la planche vit dans `.ailed/`, ignoré par git,
  et peut être vidée à tout moment sans perte. Ses deux seules écritures hors `.ailed/` sont des
  **réglages**, pas du contenu : l'URL de base dans `memory/config.md` § *Application locale*
  (quand l'humain la donne) et l'entrée `.ailed/` du `.gitignore` si elle manque. Elle n'écrit
  jamais dans le reste de `memory/` et ne commite rien.

## Exemple d'utilisation
> `/ailed-screens --ticket {{TICKET_PREFIX}}-000012`
> → liste de prises de vue proposée, validée par l'humain, puis
> `.ailed/screens/{{TICKET_PREFIX}}-000012_20260902143012.html` à ouvrir au navigateur.

## Artefacts mis à jour
Aucun artefact versionné. Une planche HTML éphémère sous `.ailed/screens/`.
