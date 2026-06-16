# Prompt — Init Memory

Prompt à coller pour reconstruire la mémoire d'un **projet existant**. Équivalent de
l'agent `@ailed-init-memory`.

---

Analyse l'intégralité de ce repository (code, documentation, dépendances, configuration
d'infra, historique Git) et reconstruis la mémoire projet dans `memory/`.

Pour chaque fichier de `memory/` (`context`, `glossary`, `features`, `architecture`,
`decisions`, `project-state`, `roadmap`, `kanban`), renseigne ce que tu peux déduire en
**marquant le niveau de confiance** de chaque section : `confirmé`, `probable`, `supposé`.

Contraintes :
- Aucune affirmation non sourcée présentée comme certaine.
- Liste explicitement les inconnues et convertis-les en tickets `TO_CHECK` dans
  `memory/kanban.md`.
- N'invente aucune décision d'architecture : si un choix n'est pas traçable, marque-le
  `supposé` et crée un `TO_CHECK`.
