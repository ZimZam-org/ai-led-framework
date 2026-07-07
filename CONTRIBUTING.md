> 🌍 **Language**: English · [Français](#français)

# Contributing to AI-Led

Thanks for your interest in contributing! This project is a zero-dependency Node.js
CLI that scaffolds an AI-agent-driven workflow for Claude Code. Contributions of all
kinds are welcome: bug reports, new agents/skills, documentation, and code.

## Getting started

```bash
git clone https://github.com/ZimZam-org/ai-led-framework.git
cd ai-led-framework
# No install step — the CLI has zero runtime dependencies (Node >= 18)
node bin/ai-led.js help
```

Test the installer against a throwaway target project without publishing:

```bash
node bin/ai-led.js init --trigram=TST -y
# or
npm link && ai-led init
```

## Project layout

```
bin/ai-led.js              # install CLI (Node, zero dependencies)
templates/claude/agents/   # agent sources (placeholders {{TICKET_PREFIX}}, {{E2E}}…)
templates/claude/skills/   # skill sources
templates/claude/commands/ # slash-command sources (/ailed-bootstrap)
templates/memory/fr/       # French memory source (default)
templates/memory/en/       # English memory source
```

## How to contribute

1. **Open an issue first** for anything non-trivial, so we can agree on the approach.
2. **Fork** the repo and create a branch from `main`:
   `feat/short-description` or `fix/short-description`.
3. Keep changes focused. One logical change per pull request.
4. Follow the existing style: match the surrounding code's naming, comments, and idioms.
5. Update `README.md` **and** `README.fr.md` when a change affects documented behavior.
6. Add an entry to `CHANGELOG.md` under the `Unreleased` section.
7. Run the smoke test: `npm test` (runs `node bin/ai-led.js help`).

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(cli): add --lang flag to init
fix(agents): correct placeholder substitution for {{E2E}}
docs(readme): document Jira integration
```

## Pull requests

- Fill in the PR template.
- Ensure the CI check passes.
- Link the related issue (`Closes #123`).
- Maintainers may request changes; please keep the discussion in the PR thread.

## Reporting bugs & requesting features

Use the [issue templates](https://github.com/ZimZam-org/ai-led-framework/issues/new/choose).

## License

By contributing, you agree that your contributions will be licensed under the
project's [MIT License](LICENSE).

---

<a name="français"></a>

# Contribuer à AI-Led

Merci de votre intérêt ! Ce projet est une CLI Node.js sans dépendance qui installe un
workflow piloté par des agents IA pour Claude Code. Toutes les contributions sont les
bienvenues : rapports de bug, nouveaux agents/skills, documentation et code.

## Démarrage

```bash
git clone https://github.com/ZimZam-org/ai-led-framework.git
cd ai-led-framework
node bin/ai-led.js help          # aucune installation — zéro dépendance (Node >= 18)
```

Tester l'installeur sur un projet jetable sans publier :

```bash
node bin/ai-led.js init --trigram=TST -y
# ou
npm link && ai-led init
```

## Comment contribuer

1. **Ouvrez d'abord une issue** pour tout changement non trivial.
2. **Forkez** le dépôt et créez une branche depuis `main` (`feat/...` ou `fix/...`).
3. Une seule modification logique par pull request.
4. Respectez le style existant (nommage, commentaires, idiomes).
5. Mettez à jour `README.md` **et** `README.fr.md` si le comportement documenté change.
6. Ajoutez une entrée dans `CHANGELOG.md` sous la section `Unreleased`.
7. Lancez le test : `npm test`.

## Messages de commit

Nous suivons les [Conventional Commits](https://www.conventionalcommits.org/).

## Licence

En contribuant, vous acceptez que vos contributions soient publiées sous la
[licence MIT](LICENSE) du projet.
