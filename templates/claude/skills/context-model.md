---
name: ailed-context-model
description: Rédige le modèle de contexte d'un bounded context dans memory/contexts/<contexte>.md. À utiliser par @ailed-architect pour toute SPEC validée qui crée un module ou restructure une zone.
---

# Skill — ailed-context-model

## Objectif
Écrire le modèle de contexte d'un bounded context : langage, agrégats et invariants, value
objects, use cases, ports, arborescence cible. C'est la conception tactique du module.

## Paramètres
- `contexte` : nom du bounded context, repris du registre `## Solutions / cibles déployables`
  de `memory/architecture.md`.
- `spec` : la SPEC validée qui déclenche le modèle.

## Étapes
1. Relire la SPEC et lister chaque règle métier et chaque critère d'acceptation.
   Terminé quand les deux listes sont complètes.
2. Écrire `memory/contexts/<contexte>.md` avec les neuf sections du format, dans cet ordre.
   Terminé quand chaque règle métier a un propriétaire et chaque critère d'acceptation est
   relié à un use case.
3. Ajouter le lien `contexts/<contexte>.md` dans la colonne `Domaines (DDD)` de la ligne de la
   solution, dans `memory/architecture.md`. Terminé quand la ligne porte le lien.
4. Remettre le modèle à la validation humaine avec le statut `PROPOSED`. Terminé quand
   l'humain a le fichier.

## Format
```markdown
# Contexte : <contexte>

## Statut
PROPOSED · SPEC : <référence>

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
- Référence : <fichier du contrat exécutable, quand il existe>
```

## Règles
- Un fichier par bounded context. Une itération enrichit le fichier existant.
- Le statut vaut `PROPOSED` à l'écriture. La validation humaine le passe à `VALIDATED`.
- Chaque invariant a un seul propriétaire : une méthode de son agrégat.
- Un use case par intention de la SPEC. Un appelant atteint un agrégat par son use case.
- Un repository par agrégat. Il échange des objets du domaine.
- Une lecture de liste ou de vue passe par le port de lecture.
- Un contexte voisin se joint par son port.
- La section « Couche anti-corruption » décrit un projet existant. Elle reste vide sur un
  projet neuf.

## Exemple
> « Modélise le contexte Facturation à partir de la SPEC Avoirs » → écrit
> `memory/contexts/facturation.md` et lie la ligne `facturation` du registre.

## Artefacts mis à jour
`memory/contexts/<contexte>.md`, `memory/architecture.md`.

{{WRITING_RULES}}
