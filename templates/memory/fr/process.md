# Processus & Workflows

Last Updated: {{DATE}}

Décrit les workflows pilotés par agents. Chaque étape consomme les artefacts de la précédente (constitution règle 9). Maintenu par le framework AI-Led.

## Principes

- Aucun développement sans ticket ; aucun ticket sans SPEC validée par un humain.
- Chaque agent a des entrées/sorties définies (voir `.claude/agents/`).
- Les quality gates de l'Étape 8 doivent être verts avant clôture d'un ticket.

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

