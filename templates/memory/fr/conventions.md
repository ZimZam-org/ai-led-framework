# Conventions & organisation technique

Last Updated: {{DATE}}

> Trois parties, dans cet ordre. *Conventions en place* décrit l'existant sans le juger.
> *Audit DDD* donne un verdict par convention en place. *Cible des nouveaux modules* prescrit
> la conception d'un nouveau contexte.
>
> La partie qui gouverne un fichier dépend du fichier : l'ancien code et les adapters de la
> couche anti-corruption suivent les conventions en place ; un nouveau contexte suit la cible.
> `architecture.md` répond au « quoi » ; ce fichier répond au « comment on code ici ».
> Lu par `@ailed-architect`, `@ailed-dev` et `@ailed-ux` avant d'agir.

## Conventions en place

> Descriptif. Renseigné à l'install (`npx @s2bp/ai-led-framework init --conventions=<chemin>`),
> par `@ailed-init-memory`, ou à la main. Reste vide sur un projet `greenfield` sans import.
> Un changement ici déclenche un nouvel audit des lignes touchées.

### Organisation du code

TODO  (structure des dossiers, découpage en modules/couches)

### Conventions de nommage

TODO  (fichiers, classes, fonctions, variables, branches, commits)

### Patterns & règles imposés

TODO  (patterns d'architecture imposés, wrappers obligatoires, anti-patterns interdits)

### Stack & bibliothèques

TODO  (libs imposées / interdites, versions, raisons)

### Stratégie de branches & review

TODO  (modèle de branches, règles de MR, exigences de review)

## Audit DDD

> Rempli par `@ailed-architect` avant d'écrire la cible, dès que la partie *Conventions en place*
> porte autre chose que les placeholders. Une ligne par convention extraite, avec le titre de sa
> section source. Trois verdicts : `compatible` (la cible la reprend), `confinée` (elle gouverne
> l'ancien code et l'infrastructure ; la couche anti-corruption traduit vers les types du
> domaine), `remplacée` (un ADR écrit la convention de remplacement dans la cible).
>
> Chaque verdict autre que `compatible` cite un numéro de `/ailed-ddd-checklist`.
> Un humain valide l'audit avec la cible, au point de validation humaine après `Architect`.

| Convention | Section source | Verdict | Anti-pattern (n°) | ADR |
| ---------- | -------------- | ------- | ----------------- | --- |

## Cible des nouveaux modules

> Prescriptif. Rempli par `@ailed-architect` après l'audit ; un humain valide la cible avec
> l'audit. Contient seulement des conventions `compatible` et des conventions de remplacement.
> Sur un projet `greenfield` sans import, cette partie est la seule convention du projet.

### Organisation d'un contexte

TODO  (arborescence par sous-domaine, puis par couche : domaine, application, infrastructure)

### Nommage du domaine

TODO  (termes approuvés du contexte dans `glossary.md` ; use cases, agrégats, value objects,
       ports)

### Patterns de la cible

TODO  (agrégat propriétaire de ses invariants, repository par agrégat, port de lecture, port par
       contexte voisin, couche anti-corruption)

### Stack de la cible

TODO  (libs retenues pour un nouveau contexte, versions, raisons)

### Contrat de frontières

TODO  (outil retenu, ADR, emplacement du contrat et de la baseline, commande à lancer)
