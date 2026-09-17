## Framework AI-Led

Ce projet est piloté par le framework **AI-Led** (v{{FRAMEWORK_VERSION}}) : mémoire persistante
(`memory/`), agents préfixés `ailed-*` (`.claude/agents/`) et skills (`.claude/skills/`).

### Règles non négociables

1. **`memory/` est la source de vérité.** Lis-la avant une tâche, mets-la à jour après.
   Ne t'appuie jamais sur « ce qui a été dit plus haut » pour un fait durable.
2. **Aucun développement sans ticket ; aucun ticket sans SPEC validée par un humain.**
   Les tickets vivent dans `memory/kanban.md` (préfixe `{{TICKET_PREFIX}}-`).
3. **Ne crée pas de tâche hors de ta mission.** Un constat fait en passant — dette,
   bug mineur, idée d'évolution, manque de doc — ne devient pas un ticket : il va dans
   `memory/observations.md`. Seuls deux cas entrent directement au kanban : une demande
   explicite de l'humain, et une sévérité `CRITICAL` ou `HIGH`. Voir `memory/process.md`
   § « Constats non demandés ».
4. **`memory/kanban.md` est un tableau, pas un journal.** Aucune cellule au-delà de
   {{MAX_CELL_BYTES}} octets : au-delà, c'est une spécification, elle vit dans `memory/specs/`.
   Un récit d'EPIC ou un rapport de revue n'entre pas dans le kanban. Une mise à jour se fait
   **en place**, elle ne s'empile pas en commentaires datés.
5. **`memory/config.md` fait autorité sur l'outillage.** Une intégration qui vaut
   `{{DISABLED}}` n'est pas disponible : signale le pré-requis manquant et arrête-toi.
   La connexion d'un MCP ne vaut **jamais** activation d'une intégration.
6. **Respecte les entrées/sorties de chaque agent** (`.claude/agents/`) et les points de
   validation humaine des workflows (`memory/process.md`).
7. **Tout texte produit suit `memory/writing-rules.md`** : une idée par phrase, 20 mots
   au maximum, voix active, un terme = un sens. La langue est celle des fichiers `memory/`.

### Démarrage

`/ailed-bootstrap` amorce une session. Les workflows (Discovery / Feature / Incident /
Security) et leurs points de validation humaine sont décrits dans `memory/process.md`.

### Entretien

`npx @s2bp/ai-led-framework doctor` vérifie que l'installation est opérationnelle.
`npx @s2bp/ai-led-framework archive` sort du kanban les tickets livrés.
