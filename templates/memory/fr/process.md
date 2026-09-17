# Processus & Workflows

Last Updated: {{DATE}}

Décrit les workflows pilotés par agents. Chaque étape consomme les artefacts de la précédente (constitution règle 9). Maintenu par le framework AI-Led.

## Principes

- Aucun développement sans ticket ; aucun ticket sans SPEC validée par un humain.
- **Aucun agent ne crée de tâche hors de sa mission** (cf. § « Constats non demandés »).
- Chaque agent a des entrées/sorties définies (voir `.claude/agents/`).
- Les quality gates de l'Étape 8 doivent être verts avant clôture d'un ticket.

---

## Constats non demandés

Un agent qui travaille voit des choses : de la dette, un bug mineur, une idée d'évolution,
un manque de doc. En faire des tickets paraît rigoureux. En pratique, le backlog devient
illisible, et la décision de faire — qui appartient à un humain — se prend toute seule.

**Règle** : un constat hors mission ne devient pas un ticket. Il s'écrit dans
`memory/observations.md`, avec sa sévérité et sa source.

| Constat | Destination |
| ------- | ----------- |
| Demandé explicitement par un humain | `memory/kanban.md` |
| Sévérité `CRITICAL` ou `HIGH` | `memory/kanban.md` **et** `memory/observations.md` |
| Tout le reste | `memory/observations.md` **uniquement** |

C'est exactement le patron déjà appliqué à la veille : `@ailed-scout` collecte largement
dans `market-watch.md`, et **seul un humain promeut** un sujet vers le workflow Feature. Le
volet technique suit désormais la même discipline. L'agent **propose** une promotion ; il ne
la décide pas.

Une observation `ouvert` de plus de **90 jours** passe `périmé` : trois mois sans qu'elle
soit jugée assez importante, c'est une réponse.

---

## Rotation & nettoyage de la mémoire

Quatre fichiers grossissent sans limite : `kanban.md`, `incidents.md`, `decisions.md` et
`market-watch.md`. Chaque lecture par un agent coûte alors plus de tokens. Pour garder les
lectures légères, le fichier actif ne conserve **que les entrées actives**. Le reste part dans
`memory/archive/<même nom>.md`, créé à la demande. Le fichier actif porte alors en tête la
ligne `> Archives : memory/archive/<fichier>.md`.

Principe : **rien ne disparaît, tout se déplace.** Les agents lisent **uniquement le fichier
actif**. L'archive s'ouvre pour une seule raison : une investigation historique explicite.

| Fichier | Reste inline (actif) | Part en archive |
| ------- | -------------------- | --------------- |
| `kanban.md` | tickets vivants (`TO_CHECK`→`TO_TEST`) + `DONE` pas encore livrés en release | tickets `DONE` livrés **dont la fonctionnalité est captée dans `features.md`** |
| `incidents.md` | incidents ouverts ou clôturés < 90 j | le reste |
| `decisions.md` | ADR encore en vigueur | ADR supersédés / obsolètes |
| `market-watch.md` | observations < 6 mois et non écartées | le reste |
| `observations.md` | constats `ouvert` et `promu` | `écarté` et `périmé` |

**Déclencheurs** (pour que l'archivage ait réellement lieu, jamais « au feeling ») :

- **Au fil de l'eau** : l'agent mainteneur archive dès qu'il édite le fichier et qu'une entrée
  bascule d'« active » à « archivable ».
- **Seuil de volume** : dès qu'un fichier dépasse **40 entrées actives** *ou* son budget en
  octets, l'agent qui le touche archive le surplus **avant** d'écrire. Le compte d'entrées seul
  ne suffit pas : 85 tickets dont chaque ligne est une dissertation pèsent 300 Ko sans jamais
  franchir le seuil des 40. Budgets : `kanban.md` 120 Ko · `decisions.md` 80 Ko · `epics.md`
  60 Ko · les autres 60 Ko. `npx @s2bp/ai-led-framework doctor` les vérifie.
- **Poids d'une cellule** : une cellule de `kanban.md` tient en **{{MAX_CELL_BYTES}} octets**.
  Une ligne porte légitimement une description, un périmètre et des critères d'acceptation ; ce
  qui dérape, c'est **une cellule qui devient une dissertation**. Le détail (analyse, inventaire,
  protocole de test) vit dans `memory/specs/` et la cellule y renvoie.
- **Part de prose** : `kanban.md` est un tableau, pas un journal. Récits d'EPIC, rapports de
  revue et commentaires datés appartiennent à `memory/specs/` ou à l'archive. Au-delà de **40 %**
  du fichier hors lignes de tableau, `doctor` le signale. Une mise à jour se fait **en place** :
  on corrige la cellule, on n'empile pas un commentaire daté de plus sous le tableau.
- **Commande dédiée** : `npx @s2bp/ai-led-framework archive` déplace les tickets terminés
  vers l'archive (simulation par défaut, `--apply` pour écrire). L'archivage ne dépend donc
  plus de la seule vigilance d'un agent.
- **Kanban à la release** : `@ailed-release` **archive les tickets `DONE` embarqués vers
  `memory/archive/kanban.md`**, mais **seulement une fois vérifié que `features.md` reflète la
  fonctionnalité livrée** (sinon le ticket reste inline : on ne perd jamais une info pas encore
  captée ailleurs). `features.md` est la **trace durable du livré** ; `archive/kanban.md` ne
  conserve que l'historique brut ticket→MR→date.

---

## Hygiène de session (coût & contexte)

La `memory/` étant la **source de vérité**, la conversation n'a pas à tout retenir. Les longues
sessions coûtent des tokens *même en cache* — d'où quelques règles :

- **Une unité de travail = une session.** Un ticket dev, un incident, une passe de veille se
  mènent dans une session propre ; on recharge le contexte utile depuis `memory/` au démarrage
  plutôt que de traîner un historique qui gonfle.
- **`/clear` aux frontières.** À la fin d'un workflow (capstone) ou à l'ouverture d'une MR, le
  hook `ailed-runtime-hook.js` suggère `/clear` : le suivre remet le contexte à zéro sans perte
  (l'état vit dans `memory/`).
- **`/compact` en cours de tâche** si une même session s'allonge, pour condenser sans repartir
  de zéro.
- Les agents ne s'appuient jamais sur « ce qui a été dit plus haut » pour un fait durable : ils
  l'écrivent dans `memory/` et le relisent.

---

## Workflow Discovery

`(Scout · SEO/ASO · Monétisation) → Fact-Check → Analyst → [validation humaine] → Brainstorm (entrée du workflow Feature)`

```mermaid
flowchart LR
    SC[Scout<br/>obs. marché/feature] --> FC[Fact-Check<br/>gate anti-hallucination]
    SE[SEO/ASO<br/>découvrabilité] --> FC
    MO[Monétisation<br/>pricing vs concurrence] --> FC
    FC --> AN[Analyst<br/>tendances + sujets scorés]
    AN -. validation humaine .-> BS[Brainstorm<br/>SPEC]
```

`@ailed-scout`, `@ailed-seo-aso` et `@ailed-monetization` sont des **collecteurs spécialisés**
qui alimentent les mêmes « Observations brutes » ; `@ailed-analyst` reste le seul à fusionner
ces signaux dans un **backlog unique scoré**.

Workflow **exploratoire** alimentant `memory/market-watch.md` (veille concurrentielle).
Il **ne crée jamais** de ticket ni d'entrée roadmap : il produit un **backlog de sujets
candidats** scorés. Un humain promeut un sujet (`candidat` → `validé→brainstorm`), qui
**rejoint alors le workflow Feature** par `@ailed-brainstorm`. Désactivé tant que
l'intégration **Veille** vaut `{{DISABLED}}` dans `config.md`.

**Point de validation humaine** : après `Analyst` (promotion d'un sujet candidat).

> Boucle d'amélioration continue : `Scout → Fact-Check → Analyst` peut être relancé sur
> une cadence (ex. mensuelle) pour rafraîchir la veille et proposer une nouvelle shortlist.
> La **découverte** tourne en boucle ; la **promotion vers roadmap et le déploiement
> restent une décision humaine**.

---

## Workflow Feature

`Brainstorm → UX → PM → Architect → Planner → Dev → Review → Test → Communication → Release`

```mermaid
flowchart LR
    BS[Brainstorm<br/>SPEC] --> UX[UX<br/>wireframes]
    UX --> PM[PM<br/>EPIC + roadmap]
    PM --> AR[Architect<br/>ADR]
    AR --> PL[Planner<br/>tickets {{TICKET_PREFIX}}-*]
    PL --> DEV[Dev<br/>branche + MR]
    DEV --> RV{Review}
    RV -- CHANGES REQUESTED --> DEV
    RV -- PASS --> TS{Test<br/>{{E2E}}}
    TS -- échec --> DEV
    TS -- PASS --> CO[Communication<br/>changelog]
    CO --> RL[Release<br/>tag]
    UX -. validation humaine .-> PM
```

**Points de validation humaine** : après `Brainstorm` (SPEC), après `UX` (maquette),
avant `Release`.

---

## Workflow Incident

`Check-Log → RCA → Dev → Review → Test → Communication`

```mermaid
flowchart LR
    CL[Check-Log<br/>{{MONITORING}} 24h] --> RCA[RCA<br/>cause racine]
    RCA --> DEV[Dev<br/>correctif fix/*]
    DEV --> RV{Review}
    RV -- CHANGES REQUESTED --> DEV
    RV -- PASS --> TS{Test}
    TS -- échec --> DEV
    TS -- PASS --> CO[Communication<br/>incidents.md]
```

---

## Workflow Security

`Check-Secu → Security Review → Dev → Review → Test → Communication`

```mermaid
flowchart LR
    CS[Check-Secu<br/>scan deps/code] --> SR{Security Review<br/>OWASP}
    SR -- CHANGES REQUESTED --> DEV[Dev<br/>correctif]
    SR -- PASS --> CO[Communication]
    DEV --> RV{Review}
    RV -- CHANGES REQUESTED --> DEV
    RV -- PASS --> TS{Test}
    TS -- échec --> DEV
    TS -- PASS --> CO
```

Seules les vulnérabilités `CRITICAL` et `HIGH` déclenchent automatiquement un ticket et l'entrée dans ce workflow.

