---
name: ailed-ddd-checklist
description: Les 33 anti-patterns DDD, numérotés. Source unique citée par l'audit des conventions de @ailed-architect et par chaque constat de @ailed-review. À utiliser sur une convention, une MR ou un modèle de contexte.
---

# Skill — ailed-ddd-checklist

## Objectif
Donner un numéro à chaque anti-pattern DDD, pour qu'un verdict d'audit ou un constat de revue
cite un critère partagé au lieu d'une impression de lecture.

## Paramètres
- `cible` : une convention de `memory/conventions.md`, une MR, ou un modèle de contexte
  `memory/contexts/<contexte>.md`.

## Étapes
1. Lire la cible et le modèle de contexte concerné. Terminé quand le contexte de la cible est
   nommé.
2. Parcourir chaque item de la checklist et noter `observé` ou `absent`. Pour un item observé,
   noter l'emplacement : fichier et ligne pour du code, titre de section pour une convention,
   section du modèle sinon. Terminé quand chaque item porte une des deux mentions.
3. Rendre la liste des items observés, numéro et emplacement. Une liste vide vaut `compatible`.
   Terminé quand l'appelant a la liste.

## Checklist

### Langage et contextes
1. un nom du code absent du glossaire du contexte, ou un terme du glossaire absent du code ;
2. un terme qui porte deux sens dans le même contexte ;
3. un modèle partagé entre deux contextes sans relation explicite dans la carte des contextes ;
4. une frontière de contexte tracée sur une couche technique ou une équipe, et non sur le
   langage ;
5. le module appelle directement le code d'un autre contexte, sans port ni couche anti-corruption ;
6. un type de l'ancien code ou d'un contexte voisin traverse la frontière jusqu'au domaine ;
7. le sous-domaine cœur reçoit le même traitement qu'un sous-domaine générique ou de support.

### Agrégats et entités
8. un agrégat dont l'état est modifiable hors de ses méthodes : setters publics, propriétés
   publiques, mutation par un service ;
9. un invariant garanti ailleurs que dans une méthode de l'agrégat qui le possède ;
10. un invariant qui s'étend sur plusieurs agrégats et repose sur une transaction commune ;
11. une transaction qui modifie plusieurs agrégats ; la règle est un agrégat par transaction, et
    un événement de domaine pour le reste ;
12. un agrégat qui tient une référence objet vers un autre agrégat, au lieu de son identité ;
13. un agrégat qui charge une collection entière pour une règle qui en lit un élément ;
14. une entité enfant de l'agrégat accessible ou modifiable sans passer par la racine ;
15. une entité sans identité métier stable, ou une identité fabriquée par la persistance et
    exposée au domaine ;
16. un modèle anémique : l'entité porte des données, et les règles vivent dans des services ;
17. le domaine lit l'identité, le tenant, l'horloge ou la configuration dans un état global ; ces
    valeurs arrivent par paramètre.

### Value objects
18. une primitive remplace un concept métier : identifiant, montant, quantité, statut, adresse ;
19. un value object mutable, ou comparé par référence au lieu de ses attributs ;
20. une validation d'un concept métier répétée hors de son value object.

### Repositories et persistance
21. un repository rend ou accepte le modèle de persistance au lieu d'un objet du domaine ;
22. un repository pour une entité autre qu'une racine d'agrégat ;
23. un repository qui porte une règle métier, ou expose un constructeur de requêtes ;
24. le domaine dépend de la persistance ou d'un framework : classe de base, annotation, import ;
25. une lecture de liste ou de vue qui passe par l'agrégat, au lieu d'un port de lecture.

### Application et use cases
26. une intention de la SPEC sans use case, ou deux points d'entrée pour la même intention ;
27. une règle métier dans un use case, un contrôleur, un handler ou un script ;
28. un use case qui orchestre plus d'un agrégat dans une transaction ;
29. un service de domaine qui garde un état, ou qui dépend de l'infrastructure ;
30. un changement d'état métier significatif sans événement de domaine, ou un événement qui
    transporte l'agrégat entier.

### Structure
31. le premier niveau d'un contexte est une couche technique, au lieu d'un sous-domaine ;
32. un nom de classe qui décrit un pattern technique au lieu d'un concept métier : manager,
    helper, util, processor ;
33. une construction complexe d'agrégat répartie entre appelants, au lieu d'une factory ou d'une
    méthode nommée.

## Règles
- Un constat porte un numéro et un emplacement.
- La checklist parle en concepts DDD, valables pour toute stack.

## Exemple
> « Passe la convention “les entités héritent de BaseModel” à la checklist » → rend `24`
> (le domaine dépend d'un framework), section source *Patterns & règles imposés*.

## Artefacts mis à jour
Aucun : la skill rend une liste, l'appelant écrit le verdict ou le constat.

{{WRITING_RULES}}
