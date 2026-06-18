#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = path.resolve(__dirname, "..");
const TPL = path.join(ROOT, "templates");
const pkg = require(path.join(ROOT, "package.json"));

const argv = process.argv.slice(2);
const command = argv[0];
const force = argv.includes("--force") || argv.includes("-f");
const assumeYes = argv.includes("--yes") || argv.includes("-y");
const cwd = process.cwd();

// ── tiny logger ───────────────────────────────────────────────
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ── flag parsing (--key=value or --key value) ─────────────────
function flag(name) {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return undefined;
}

// trigram derived from project folder name: first 3 alnum chars, uppercased
function deriveTrigram() {
  const base = path.basename(cwd).replace(/[^a-zA-Z0-9]/g, "");
  return (base.slice(0, 3) || "PRJ").toUpperCase();
}

function ask(rl, question, def) {
  return new Promise((resolve) => {
    rl.question(`${question} ${c.dim(`(${def})`)} `, (answer) => {
      resolve(answer.trim() || def);
    });
  });
}

const LANG_DEFAULT = "fr";
// sentinel "integration disabled" word, per memory language
const DISABLED_WORD = { fr: "aucun", en: "none" };

// available memory languages = subfolders of templates/memory/
function availableLangs() {
  return fs
    .readdirSync(path.join(TPL, "memory"))
    .filter((d) => fs.statSync(path.join(TPL, "memory", d)).isDirectory())
    .sort();
}

async function resolveConfig() {
  const langs = availableLangs();
  let lang = (flag("lang") || LANG_DEFAULT).toLowerCase();
  if (!langs.includes(lang)) lang = LANG_DEFAULT;
  let disabled = DISABLED_WORD[lang] || "none";

  const defaults = { trigram: deriveTrigram() };

  // explicit flags always win
  const cfg = {
    lang,
    disabled,
    trigram: (flag("trigram") || defaults.trigram).toUpperCase(),
    monitoring: flag("monitoring") || disabled,
    e2e: flag("e2e") || disabled,
    promo: flag("promo") || disabled,
    watch: flag("watch") || disabled,
    seo_aso: flag("seo-aso") || disabled,
  };

  const interactive =
    !assumeYes &&
    process.stdin.isTTY &&
    !flag("lang") &&
    !flag("trigram") &&
    !flag("monitoring") &&
    !flag("e2e") &&
    !flag("promo") &&
    !flag("watch") &&
    !flag("seo-aso");

  if (interactive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    cfg.lang = (await ask(rl, `Langue des fichiers memory/ [${langs.join("/")}] :`, lang)).toLowerCase();
    if (!langs.includes(cfg.lang)) cfg.lang = LANG_DEFAULT;
    disabled = cfg.disabled = DISABLED_WORD[cfg.lang] || "none";
    console.log(c.dim(`(Entrée = valeur par défaut, \`${disabled}\` = intégration désactivée)\n`));
    cfg.trigram = (await ask(rl, "Trigramme du projet (préfixe de ticket) :", defaults.trigram)).toUpperCase();
    cfg.monitoring = await ask(rl, "Outil de monitoring / logs :", disabled);
    cfg.e2e = await ask(rl, "Outil de tests end-to-end :", disabled);
    cfg.promo = await ask(rl, "Outil de génération promo :", disabled);
    cfg.watch = await ask(rl, "Canal de veille concurrentielle (MCP web / liste d'URLs) :", disabled);
    cfg.seo_aso = await ask(rl, "Outil SEO / ASO (Search Console, Ahrefs, App Store Connect…) :", disabled);
    rl.close();
  }

  // sanitize trigram: letters/digits only, 2–5 chars
  cfg.trigram = (cfg.trigram.replace(/[^A-Z0-9]/g, "").slice(0, 5) || "PRJ");
  return cfg;
}

// ── placeholder substitution ──────────────────────────────────
function substitute(content, cfg) {
  const now = new Date().toISOString().slice(0, 10);
  return content
    .replace(/{{TICKET_PREFIX}}/g, cfg.trigram)
    .replace(/{{MONITORING}}/g, cfg.monitoring)
    .replace(/{{E2E}}/g, cfg.e2e)
    .replace(/{{PROMO}}/g, cfg.promo)
    .replace(/{{WATCH}}/g, cfg.watch)
    .replace(/{{SEO_ASO}}/g, cfg.seo_aso)
    .replace(/{{DISABLED}}/g, cfg.disabled)
    .replace(/{{DATE}}/g, now);
}

let created = 0;
let skipped = 0;

// ── recursive copy with placeholder substitution (.md only) ───
function copyTree(src, dest, cfg) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry), cfg);
    }
    return;
  }
  if (fs.existsSync(dest) && !force) {
    skipped++;
    console.log(`  ${c.yellow("skip")} ${path.relative(cwd, dest)} ${c.dim("(exists)")}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (dest.endsWith(".md")) {
    fs.writeFileSync(dest, substitute(fs.readFileSync(src, "utf8"), cfg));
  } else {
    fs.copyFileSync(src, dest);
  }
  created++;
  console.log(`  ${c.green("+")}    ${path.relative(cwd, dest)}`);
}

async function init() {
  console.log(`\n${c.bold("AI-Led")} ${c.dim("v" + pkg.version)} — initialisation dans ${c.cyan(cwd)}`);

  const cfg = await resolveConfig();
  console.log(
    `\n${c.dim("Config")} : langue=${c.bold(cfg.lang)} · trigramme=${c.bold(cfg.trigram)} · monitoring=${cfg.monitoring} · e2e=${cfg.e2e} · promo=${cfg.promo} · veille=${cfg.watch} · seo/aso=${cfg.seo_aso}\n`
  );

  // 1. Agents  ->  .claude/agents/
  console.log(c.bold("Agents") + c.dim("  → .claude/agents/"));
  copyTree(path.join(TPL, "claude", "agents"), path.join(cwd, ".claude", "agents"), cfg);

  // 2. Skills  ->  .claude/skills/<name>/SKILL.md
  console.log("\n" + c.bold("Skills") + c.dim("  → .claude/skills/"));
  const skillsSrc = path.join(TPL, "claude", "skills");
  for (const file of fs.readdirSync(skillsSrc)) {
    if (!file.endsWith(".md")) continue;
    const name = path.basename(file, ".md");
    copyTree(path.join(skillsSrc, file), path.join(cwd, ".claude", "skills", name, "SKILL.md"), cfg);
  }

  // 3. Commands  ->  .claude/commands/
  console.log("\n" + c.bold("Commands") + c.dim("  → .claude/commands/"));
  copyTree(path.join(TPL, "claude", "commands"), path.join(cwd, ".claude", "commands"), cfg);

  // 4. Memory  ->  memory/  (from the chosen language folder)
  console.log("\n" + c.bold("Mémoire") + c.dim(`  → memory/ (langue: ${cfg.lang})`));
  copyTree(path.join(TPL, "memory", cfg.lang), path.join(cwd, "memory"), cfg);

  // 5. CLAUDE.md pointer (only if absent)
  const claudeMd = path.join(cwd, "CLAUDE.md");
  if (!fs.existsSync(claudeMd)) {
    fs.writeFileSync(claudeMd, substitute(CLAUDE_MD_STUB, cfg));
    created++;
    console.log(`\n  ${c.green("+")}    CLAUDE.md ${c.dim("(pointeur framework)")}`);
  } else {
    console.log(`\n  ${c.yellow("skip")} CLAUDE.md ${c.dim("(exists — voir README pour le snippet à ajouter)")}`);
  }

  console.log(
    `\n${c.green("✓")} Terminé : ${c.bold(created)} fichier(s) créé(s), ${skipped} ignoré(s).\n`
  );
  console.log(c.bold("Prochaines étapes :"));
  console.log(`  1. Ouvre le projet dans Claude Code et lance ${c.cyan("/ailed-bootstrap")}.`);
  console.log(`  2. Vérifie/ajuste ${c.cyan("memory/config.md")} (trigramme, intégrations).`);
  console.log(`  3. Projet existant : lance ${c.cyan("@ailed-init-memory")} pour reconstruire la mémoire.`);
  console.log(`  4. Nouvelle feature : ${c.cyan("@ailed-brainstorm")} puis suis le workflow de memory/process.md.\n`);
}

const CLAUDE_MD_STUB = `# Projet piloté par AI-Led

Ce projet utilise le framework **AI-Led** : mémoire persistante (\`memory/\`),
agents préfixés \`ailed-*\` (\`.claude/agents/\`) et skills (\`.claude/skills/\`).

## Règles

- Aucun développement sans ticket ; aucun ticket sans SPEC validée par un humain.
- La mémoire \`memory/\` est la source de vérité : elle est lue avant et mise à jour après chaque tâche.
- \`memory/config.md\` fixe le trigramme de ticket (\`{{TICKET_PREFIX}}-*\`) et les intégrations outillage.
- Les workflows (Feature / Incident / Security) sont décrits dans \`memory/process.md\`.

## Agents (préfixe \`@ailed-\`)

Discovery : \`(@ailed-scout · @ailed-seo-aso · @ailed-monetization) → @ailed-fact-check → @ailed-analyst\` → (validation humaine) → \`@ailed-brainstorm\`

Feature : \`@ailed-brainstorm → @ailed-ux → @ailed-pm → @ailed-architect → @ailed-planner → @ailed-dev → @ailed-review → @ailed-test → @ailed-communication → @ailed-release\`

Incident : \`@ailed-check-log → @ailed-rca → @ailed-dev → ...\`

Security : \`@ailed-check-secu → @ailed-security-review → @ailed-dev → ...\`

Bootstrap : \`@ailed-init-memory\`, \`@ailed-knowledge-audit\`.
`;

function help() {
  console.log(`
${c.bold("ai-led")} ${c.dim("v" + pkg.version)} — framework de workflow AI-led pour Claude Code

${c.bold("Usage")}
  npx @s2bp/ai-led-framework <command> [options]

${c.bold("Commands")}
  init            Installe agents, skills et mémoire dans le projet courant
  help            Affiche cette aide
  version         Affiche la version

${c.bold("Options de init")}
  --lang=fr|en        Langue des fichiers memory/ (défaut : fr)
  --trigram=XYZ       Préfixe de ticket (défaut : 3 lettres du nom du dossier)
  --monitoring=NOM    Outil de monitoring (ex. Sentry) ou désactivé (défaut)
  --e2e=NOM           Outil de tests E2E (ex. Playwright) ou désactivé (défaut)
  --promo=NOM         Outil de génération promo (ex. Remotion) ou désactivé (défaut)
  --watch=NOM         Canal de veille concurrentielle (MCP web / URLs) ou désactivé (défaut)
  --seo-aso=NOM       Outil SEO / ASO (Search Console, Ahrefs, App Store Connect) ou désactivé (défaut)
  -y, --yes           Mode non interactif (valeurs par défaut / flags fournis)
  -f, --force         Écrase les fichiers existants (par défaut : ignorés)

${c.dim("Sans flag et en terminal interactif, init pose les questions de configuration.")}
`);
}

(async () => {
  switch (command) {
    case "init":
      await init();
      break;
    case "version":
    case "--version":
    case "-v":
      console.log(pkg.version);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      help();
      break;
    default:
      console.error(`Commande inconnue : ${command}\n`);
      help();
      process.exit(1);
  }
})();
