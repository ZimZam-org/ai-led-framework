# Règles de rédaction

Last Updated: {{DATE}}

Norme des textes produits par le framework. Profil dérivé de ASD-STE100
(*Simplified Technical English*), transposé au français. Les agents lisent ce fichier avant
de rédiger. La commande `npx @s2bp/ai-led-framework lint` vérifie les règles mesurables.

## Portée

La norme s'applique à tout texte produit par un agent ou une skill :

- les fichiers `memory/*.md` ;
- les tickets, les critères d'acceptation, les SPEC et les ADR ;
- les rapports : `/ailed-status`, review, quality-gate, RCA, scan de sécurité ;
- le texte poussé vers un outil externe (Jira, Confluence) ;
- les entrées de changelog et les release notes.

Deux exclusions explicites :

- le contenu promotionnel (`/ailed-promo`, sorties promo de `@ailed-communication`) suit la
  voix de marque du projet ;
- le code et les messages de commit suivent `memory/conventions.md`.

## Langue

Le texte reprend la langue des fichiers `memory/`, déclarée dans `memory/config.md`.
Les 12 règles valent pour les deux langues. Le profil anglais s'appuie en plus sur le
dictionnaire ASD-STE100. Le profil français applique les mêmes règles structurelles et sa
propre liste de tournures interdites.

## Les 12 règles

| N° | Règle | Contrôle |
| -- | ----- | -------- |
| 1 | Une idée par phrase. Une phrase porte une information. | humain |
| 2 | 20 mots par phrase au maximum. 25 pour une instruction. | `lint` |
| 3 | Voix active. Le sujet précède le verbe. | `lint` |
| 4 | Présent de l'indicatif. Impératif pour une instruction. | humain |
| 5 | Un terme = un sens. Les synonymes du même concept sont interdits. | `lint` |
| 6 | Aucun sigle absent du glossaire. | `lint` |
| 7 | Trois mots au maximum par groupe nominal. Pas de chaîne de trois « de ». | `lint` |
| 8 | Déterminants obligatoires. Le style télégraphique est interdit. | humain |
| 9 | Six lignes par paragraphe au maximum. Une procédure devient une liste numérotée. | `lint` |
| 10 | Verbes concrets. Les verbes fourre-tout sont interdits. | `lint` |
| 11 | Faits chiffrés. Un nombre, un ID ou un nom de fichier remplace un qualificatif. | humain |
| 12 | Phrase affirmative. La négation sert l'avertissement, placé avant son instruction. | humain |

> La règle 2 fixe une limite, pas une cible. Une phrase de 8 mots reste préférable.
> La règle 5 s'appuie sur `memory/glossary.md` : un concept y porte un seul nom.

## Termes et tournures interdits

| Interdit | À la place |
| -------- | ---------- |
| `etc.` · `notamment` · `entre autres` | la liste complète, ou « 3 exemples : … » |
| `gérer` · `traiter` · `prendre en charge` | le verbe exact : créer, valider, supprimer, envoyer |
| `permettre de` · `donner la possibilité de` | le verbe direct |
| `adresser` (un problème) | corriger, ou traiter la cause |
| `au niveau de` · `dans le cadre de` | dans, sur, pour, pendant |
| `il convient de` · `il est nécessaire de` | l'impératif |
| `il est important de noter que` · `en effet` · `par ailleurs` | rien : supprimer la formule |
| `pourrait` · `devrait` · `semblerait` (prudence) | le fait, ou « non vérifié : … » |
| `différents` · `divers` · `plusieurs` | le nombre exact |
| `rapidement` · `prochainement` | la date ou le délai |
| `optimiser` · `améliorer` (seul) | la mesure visée : « ramener X de 800 ms à 200 ms » |

## Dictionnaire de projet

`memory/glossary.md` est le dictionnaire d'autorité. Il porte trois colonnes utiles à la
règle 5 : le terme approuvé, son sens unique, les synonymes interdits.

Un agent qui rencontre un concept sans nom approuvé ajoute une ligne au glossaire.
Il n'improvise jamais un synonyme. Il développe un sigle absent du glossaire à sa première
occurrence, puis il ajoute ce sigle au glossaire.

## Contrôle automatique

```bash
npx @s2bp/ai-led-framework lint            # tous les fichiers memory/
npx @s2bp/ai-led-framework lint --strict   # les avertissements deviennent bloquants
npx @s2bp/ai-led-framework lint <chemin>   # un fichier ou un dossier précis
```

Le rapport donne `fichier:ligne`, la règle et l'extrait fautif. Le code de sortie vaut `1`
dès la première erreur. La skill `/ailed-quality-gate` inclut ce contrôle dans sa checklist.

Le contrôle ignore le code, les tableaux, les titres et les diagrammes Mermaid : la règle
porte sur la prose.

## Réglage et limites

La norme s'active dans `memory/config.md`, section *Rédaction*. La valeur `{{DISABLED}}`
la désactive : les agents reviennent alors au seul *Style de sortie*.

Ce profil **dérive** de ASD-STE100. Il n'en est pas une implémentation certifiée.
La spécification ASD et son dictionnaire de mots approuvés restent la propriété de
l'*AeroSpace and Defence Industries Association of Europe*. Le framework en reprend les
principes, pas le contenu.
