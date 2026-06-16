# Prompt — Knowledge Audit

Prompt à coller pour auditer la complétude de la mémoire. Équivalent de l'agent
`@ailed-knowledge-audit`.

---

Audite la complétude de la mémoire projet (`memory/*`) et produis un score par dimension :

```markdown
- Contexte        : NN %
- Architecture    : NN %
- Fonctionnalités : NN %
- Glossaire       : NN %
```

Pour chaque dimension dont le score est **inférieur à 70 %**, crée au moins un ticket de
remédiation (`TO_CHECK` ou `TODO`) dans `memory/kanban.md`, en décrivant précisément
l'information manquante et où la trouver.

Ne modifie pas le contenu factuel de la mémoire : tu mesures et tu crées des tickets,
tu ne complètes pas toi-même (c'est le rôle de `@ailed-init-memory` ou d'un humain).
