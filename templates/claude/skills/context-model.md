---
name: ailed-context-model
description: Rédige le modèle de contexte d'un bounded context dans memory/contexts/<contexte>.md. À utiliser par @ailed-architect pour toute SPEC validée qui crée un module ou restructure une zone.
---

# Skill — ailed-context-model

## Objectif
Écrire le modèle de contexte d'un bounded context : langage, agrégats et invariants, value
objects, use cases, ports, couche anti-corruption, arborescence cible, contrat de frontières.
C'est la conception tactique du module.

## Paramètres
- `contexte` : nom du bounded context, repris du registre `## Solutions / cibles déployables`
  de `memory/architecture.md`.
- `spec` : la SPEC validée qui déclenche le modèle.
- `mode` : le mode projet, lu dans `memory/config.md` § Mode projet.

## Étapes
1. Relire la SPEC et lister chaque règle métier et chaque critère d'acceptation. Sur
   `brownfield`, le périmètre du modèle est celui de la SPEC : l'existant hors périmètre reste
   dans le contexte « ancien code ». Terminé quand les deux listes sont complètes.
2. Écrire `memory/contexts/<contexte>.md` avec les neuf sections du format, dans cet ordre.
   Terminé quand chaque règle métier a un propriétaire et chaque critère d'acceptation est
   relié à un use case.
3. Ajouter chaque terme du langage dans `memory/glossary.md` § Termes approuvés, avec le
   contexte en colonne. Terminé quand chaque terme de la section « Langage » a sa ligne.
4. Dans `memory/architecture.md` : ajouter le lien `contexts/<contexte>.md` dans la colonne
   `Domaines (DDD)` de la ligne de la solution, et une ligne du contexte dans la carte des
   contextes. Sur `brownfield`, la carte porte aussi l'ancien code comme un contexte à part, et
   la couche anti-corruption sur chaque frontière avec lui. Terminé quand la ligne du registre
   porte le lien et la carte porte le contexte.
5. Remettre le modèle à la validation humaine avec le statut `PROPOSED`. Terminé quand le
   message de remise cite le chemin du fichier et son statut.

## Format
```markdown
# Contexte : <contexte>

## Statut
PROPOSED · SPEC : <référence> · mode : <greenfield | brownfield>

## Langage
| Terme | Sens dans ce contexte |

## Agrégats
### <Agrégat>
| Invariant | Propriétaire (méthode) | Règle métier de la SPEC |

## Value objects
| Value object | Primitive remplacée | Validation portée |

## Use cases
| Use case | Intention de la SPEC | Critères d'acceptation |

## Ports
- Repository `<Agrégat>Repository` : il échange des objets du domaine.
- Port de lecture : <listes et vues servies sans passer par l'agrégat>.
- Port par contexte voisin : <contexte voisin> → <port>.

## Couche anti-corruption
| Nom dans l'ancien code | Terme du domaine | Adapter |

## Arborescence cible
<contexte>/<sous-domaine>/{domaine, application, infrastructure}

## Contrat de frontières
- Le domaine dépend de lui-même.
- L'application dépend du domaine et des ports.
- L'infrastructure et l'ancien code passent par les ports.
- Outil : <outil retenu, ADR> · contrat : <fichier> · baseline : <fichier, vide en greenfield>
```

## Règles
- Un fichier par bounded context. Une itération enrichit le fichier existant.
- Le statut vaut `PROPOSED` à l'écriture. La validation humaine le passe à `VALIDATED`.
  `@ailed-planner` découpe un contexte `VALIDATED` seulement.
- Chaque invariant a un seul propriétaire : une méthode de son agrégat.
- Un use case par intention de la SPEC. Un appelant atteint un agrégat par son use case.
- Un repository par agrégat. Il échange des objets du domaine.
- Une lecture de liste ou de vue passe par le port de lecture.
- Un contexte voisin se joint par son port.
- La section « Couche anti-corruption » décrit un projet `brownfield` : une ligne par nom de
  l'ancien code traduit vers le domaine. Elle reste vide sur un projet `greenfield`.
- Les termes du langage sont les termes approuvés du contexte : le code les reprend tels quels.

## Exemple
> « Modélise le contexte Facturation à partir de la SPEC Avoirs » → écrit
> `memory/contexts/facturation.md`, lie la ligne `facturation` du registre et ajoute
> `Facturation` à la carte des contextes.

## Artefacts mis à jour
`memory/contexts/<contexte>.md`, `memory/architecture.md`, `memory/glossary.md`.

{{WRITING_RULES}}
