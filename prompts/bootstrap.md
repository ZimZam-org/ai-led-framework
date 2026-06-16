# Prompt — Bootstrap AI-Led

Prompt à coller dans Claude Code **juste après `npx ai-led init`** sur un projet
(nouveau ou existant) pour amorcer le framework.

---

Tu travailles désormais selon le framework **AI-Led** installé dans ce projet.

1. Lis `memory/process.md` pour connaître les 3 workflows (Feature / Incident / Security)
   et les points de validation humaine.
2. Lis les agents disponibles dans `.claude/agents/` (tous préfixés `ailed-`) et les
   skills dans `.claude/skills/`.
3. Si le projet contient déjà du code : lance l'agent `@ailed-init-memory` pour
   reconstruire la mémoire à partir du code, de la doc et de l'historique Git, en
   indiquant un niveau de confiance par section.
4. Si le projet est vide : démarre par `@ailed-brainstorm` pour cadrer la première SPEC.
5. Termine par `@ailed-knowledge-audit` pour mesurer la complétude de la mémoire et
   créer les tickets `TO_CHECK` manquants.

Règles non négociables :
- La mémoire `memory/` est la source de vérité : lis-la avant chaque tâche, mets-la à
  jour après.
- Aucun développement sans ticket ; aucun ticket sans SPEC validée par un humain.
- Respecte les entrées/sorties de chaque agent.
