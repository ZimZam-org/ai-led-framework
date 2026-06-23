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
    // optional path to an existing conventions file to import verbatim ("" = none)
    conventions: flag("conventions") || "",
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
    !flag("seo-aso") &&
    !flag("conventions");

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
    cfg.conventions = await ask(rl, "Fichier de conventions / organisation technique à importer (facultatif, Entrée = ignorer) :", "");
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

// ── optional: import an existing conventions file verbatim ────
// Copies the user-provided file's content into memory/conventions.md, prefixed
// with a provenance header so agents read it as memory and humans can re-sync.
function importConventions(cfg) {
  const src = path.resolve(cwd, cfg.conventions);
  const dest = path.join(cwd, "memory", "conventions.md");
  console.log("\n" + c.bold("Conventions") + c.dim("  → memory/conventions.md"));
  if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) {
    console.log(`  ${c.yellow("skip")} ${cfg.conventions} ${c.dim("(introuvable — le stub est conservé)")}`);
    return;
  }
  const now = new Date().toISOString().slice(0, 10);
  const title = cfg.lang === "en" ? "Conventions & technical organization" : "Conventions & organisation technique";
  const sourceNote =
    cfg.lang === "en"
      ? `Source: ${cfg.conventions} (imported at install — re-sync via @ailed-init-memory if the original changes)`
      : `Source : ${cfg.conventions} (importé à l'install — re-synchroniser via @ailed-init-memory si l'original évolue)`;
  const header = `# ${title}\n\nLast Updated: ${now}\n${sourceNote}\n\n---\n\n`;
  fs.writeFileSync(dest, header + fs.readFileSync(src, "utf8"));
  created++;
  console.log(`  ${c.green("+")}    memory/conventions.md ${c.dim(`(import: ${cfg.conventions})`)}`);
}

async function init() {
  console.log(`\n${c.bold("AI-Led")} ${c.dim("v" + pkg.version)} — initialisation dans ${c.cyan(cwd)}`);

  const cfg = await resolveConfig();
  console.log(
    `\n${c.dim("Config")} : langue=${c.bold(cfg.lang)} · trigramme=${c.bold(cfg.trigram)} · monitoring=${cfg.monitoring} · e2e=${cfg.e2e} · promo=${cfg.promo} · veille=${cfg.watch} · seo/aso=${cfg.seo_aso} · conventions=${cfg.conventions || cfg.disabled}\n`
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

  // 4b. Optional: import an existing conventions file verbatim into memory/conventions.md
  if (cfg.conventions) importConventions(cfg);

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
- \`memory/conventions.md\` (facultatif) décrit les conventions et l'organisation technique en place, lues par \`@ailed-architect\`, \`@ailed-dev\` et \`@ailed-ux\`.
- Les workflows (Feature / Incident / Security) sont décrits dans \`memory/process.md\`.

## Agents (préfixe \`@ailed-\`)

Discovery : \`(@ailed-scout · @ailed-seo-aso · @ailed-monetization) → @ailed-fact-check → @ailed-analyst\` → (validation humaine) → \`@ailed-brainstorm\`

Feature : \`@ailed-brainstorm → @ailed-ux → @ailed-pm → @ailed-architect → @ailed-planner → @ailed-dev → @ailed-review → @ailed-test → @ailed-communication → @ailed-release\`

Incident : \`@ailed-check-log → @ailed-rca → @ailed-dev → ...\`

Security : \`@ailed-check-secu → @ailed-security-review → @ailed-dev → ...\`

Bootstrap : \`@ailed-init-memory\`, \`@ailed-knowledge-audit\`.
`;

// ── status: aggregate memory into a snapshot (terminal or static HTML) ──
const MEMORY_ORDER = [
  "project-state", "roadmap", "kanban", "epics", "features",
  "market-watch", "process", "architecture", "conventions", "decisions",
  "incidents", "security", "context", "glossary", "config",
];
const STATUSES = ["TO_CHECK", "TODO", "IN_PROGRESS", "TO_TEST", "DONE"];

function daysSince(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || "");
  if (!m) return null;
  return Math.floor((Date.now() - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000);
}

function staleThreshold(name) {
  return name === "market-watch" ? 30 : 60;
}

function readMemory(memDir) {
  const entries = [];
  for (const name of MEMORY_ORDER) {
    const p = path.join(memDir, name + ".md");
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, "utf8");
    const title = ((content.match(/^#\s+(.+)$/m) || [])[1] || name).trim();
    const date = (content.match(/Last Updated:\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    entries.push({ name, file: name + ".md", content, title, date, age: daysSince(date) });
  }
  return entries;
}

function kanbanCounts(content) {
  const counts = {};
  for (const s of STATUSES) counts[s] = 0;
  for (const line of content.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    for (const cell of line.split("|").map((s) => s.trim())) {
      if (counts[cell] !== undefined) counts[cell]++;
    }
  }
  return counts;
}

function disabledIntegrations(cfgContent) {
  const out = [];
  for (const line of cfgContent.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    if (!/`(aucun|none)`/.test(line)) continue;
    const label = line.split("|").map((s) => s.trim())[1] || "";
    if (label && !/Domaine|Area|---/.test(label)) out.push(label);
  }
  return out;
}

function statusTerminal(entries, memDirRel) {
  console.log(`\n${c.bold("AI-Led")} ${c.dim("— état du projet")} · ${c.cyan(memDirRel)}\n`);
  for (const e of entries) {
    let age;
    if (e.age === null) age = c.dim("(date ?)");
    else {
      const txt = `(maj il y a ${e.age} j)`;
      age = e.age > staleThreshold(e.name) ? c.yellow(txt) : c.dim(txt);
    }
    console.log(`  ${c.cyan(e.file.padEnd(18))} ${e.title}  ${age}`);
  }
  const kb = entries.find((e) => e.name === "kanban");
  if (kb) {
    const k = kanbanCounts(kb.content);
    console.log(`\n${c.bold("Kanban")}   ${STATUSES.map((s) => `${s} ${c.bold(k[s])}`).join("   ")}`);
  }
  const watch = [];
  for (const e of entries) {
    if (e.age !== null && e.age > staleThreshold(e.name)) {
      watch.push(`${e.file} pas à jour depuis ${e.age} jours`);
    }
  }
  const cfg = entries.find((e) => e.name === "config");
  if (cfg) {
    const off = disabledIntegrations(cfg.content);
    if (off.length) watch.push(`intégrations désactivées : ${off.join(", ")}`);
  }
  if (watch.length) {
    console.log(`\n${c.bold("À surveiller")}`);
    for (const w of watch) console.log(`  ${c.yellow("•")} ${w}`);
  }
  console.log(`\n${c.dim("Vue navigateur :")} npx @s2bp/ai-led-framework status --html`);
  console.log(`${c.dim("Synthèse enrichie dans Claude Code :")} /ailed-status\n`);
}

function statusHtml(entries, outPath) {
  const data = entries.map((e) => ({
    name: e.name, file: e.file, title: e.title, date: e.date, age: e.age, content: e.content,
  }));
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");
  fs.writeFileSync(
    outPath,
    HTML_TEMPLATE.replace("/*__DATA__*/", json).replace(/__GENERATED__/g, generated)
  );
}

function status() {
  const memDir = path.join(cwd, "memory");
  if (!fs.existsSync(memDir)) {
    console.error(`\n${c.yellow("memory/ introuvable")} dans ${cwd}.`);
    console.error(`Lance d'abord : ${c.cyan("npx @s2bp/ai-led-framework init")}\n`);
    process.exit(1);
  }
  const entries = readMemory(memDir);
  if (!entries.length) {
    console.error(`\n${c.yellow("Aucun fichier memory/*.md trouvé.")}\n`);
    process.exit(1);
  }
  if (argv.includes("--html")) {
    const out = path.resolve(cwd, flag("out") || "ailed-status.html");
    statusHtml(entries, out);
    console.log(`\n${c.green("✓")} Tableau de bord généré : ${c.cyan(path.relative(cwd, out) || out)}`);
    console.log(`  Ouvre-le dans un navigateur : ${c.dim("file://" + out)}\n`);
  } else {
    statusTerminal(entries, path.relative(cwd, memDir) || memDir);
  }
}

const HTML_TEMPLATE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI-Led — Tableau de bord</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<style>
  :root { --bg:#0f1117; --panel:#171a21; --border:#252a34; --text:#e6e8eb; --muted:#8b929e; --accent:#6ea8fe; --warn:#f0c674; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--text); }
  header { padding:20px 28px; border-bottom:1px solid var(--border); display:flex; align-items:baseline; gap:16px; flex-wrap:wrap; }
  header h1 { margin:0; font-size:18px; }
  header .gen { color:var(--muted); font-size:13px; }
  .badges { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
  .badge { background:var(--panel); border:1px solid var(--border); border-radius:999px; padding:3px 10px; font-size:12px; color:var(--muted); }
  .badge b { color:var(--text); }
  .layout { display:flex; align-items:flex-start; }
  nav { position:sticky; top:0; width:230px; flex:0 0 230px; height:100vh; overflow:auto; padding:18px 12px; border-right:1px solid var(--border); }
  nav a { display:flex; justify-content:space-between; gap:8px; padding:7px 10px; border-radius:8px; color:var(--text); text-decoration:none; font-size:14px; }
  nav a:hover { background:var(--panel); }
  nav a .dot { color:var(--warn); }
  main { flex:1; padding:8px 32px 80px; max-width:900px; }
  section { padding-top:24px; }
  section h2.sec { font-size:14px; text-transform:uppercase; letter-spacing:.06em; color:var(--accent); border-bottom:1px solid var(--border); padding-bottom:6px; }
  section .stamp { color:var(--muted); font-size:12px; margin:-4px 0 8px; }
  .md table { border-collapse:collapse; width:100%; margin:12px 0; font-size:14px; }
  .md th, .md td { border:1px solid var(--border); padding:6px 10px; text-align:left; vertical-align:top; }
  .md th { background:var(--panel); }
  .md code { background:var(--panel); padding:1px 5px; border-radius:4px; font-size:13px; }
  .md pre { background:var(--panel); padding:12px; border-radius:8px; overflow:auto; }
  .md h1 { display:none; }
  .md h2, .md h3 { margin-top:18px; }
  .mermaid { background:#fff; border-radius:8px; padding:12px; margin:12px 0; }
</style>
</head>
<body>
<header>
  <h1>AI-Led — Tableau de bord</h1>
  <span class="gen">généré le __GENERATED__ · lecture seule</span>
  <div class="badges" id="badges"></div>
</header>
<div class="layout">
  <nav id="nav"></nav>
  <main id="main"></main>
</div>
<script>
  var DATA = /*__DATA__*/;
  var STATUSES = ['TO_CHECK','TODO','IN_PROGRESS','TO_TEST','DONE'];
  function staleLimit(name){ return name === 'market-watch' ? 30 : 60; }
  function kanban(md){
    var c = {}; STATUSES.forEach(function(s){ c[s]=0; });
    md.split('\\n').forEach(function(line){
      if (line.trim().charAt(0) !== '|') return;
      line.split('|').forEach(function(cell){ cell=cell.trim(); if (c[cell]!==undefined) c[cell]++; });
    });
    return c;
  }
  var kb = DATA.filter(function(e){ return e.name==='kanban'; })[0];
  if (kb){
    var k = kanban(kb.content), html='';
    STATUSES.forEach(function(s){ html += '<span class="badge">'+s+' <b>'+k[s]+'</b></span>'; });
    document.getElementById('badges').innerHTML = html;
  }
  var nav='', main='';
  DATA.forEach(function(e){
    var stale = (e.age!==null && e.age>staleLimit(e.name));
    var dot = stale ? '<span class="dot" title="périmé">●</span>' : '';
    nav += '<a href="#'+e.name+'">'+e.title+' '+dot+'</a>';
    var stamp = e.date ? ('maj '+e.date+(e.age!==null?(' · il y a '+e.age+' j'+(stale?' — périmé':'')):'')) : 'date inconnue';
    main += '<section id="'+e.name+'"><h2 class="sec">'+e.file+'</h2><div class="stamp">'+stamp+'</div><div class="md">'+marked.parse(e.content)+'</div></section>';
  });
  document.getElementById('nav').innerHTML = nav;
  document.getElementById('main').innerHTML = main;
  document.querySelectorAll('code.language-mermaid').forEach(function(code){
    var div = document.createElement('div');
    div.className='mermaid';
    div.textContent = code.textContent;
    (code.closest('pre')||code).replaceWith(div);
  });
  if (window.mermaid){ mermaid.initialize({startOnLoad:false, theme:'default'}); mermaid.run({querySelector:'.mermaid'}); }
</script>
</body>
</html>`;

function help() {
  console.log(`
${c.bold("ai-led")} ${c.dim("v" + pkg.version)} — framework de workflow AI-led pour Claude Code

${c.bold("Usage")}
  npx @s2bp/ai-led-framework <command> [options]

${c.bold("Commands")}
  init            Installe agents, skills et mémoire dans le projet courant
  status          Affiche l'état du projet (terminal) ; --html pour un tableau de bord navigateur
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
  --conventions=CHEMIN  Importe un fichier de conventions/organisation technique dans memory/conventions.md (facultatif)
  -y, --yes           Mode non interactif (valeurs par défaut / flags fournis)
  -f, --force         Écrase les fichiers existants (par défaut : ignorés)

${c.bold("Options de status")}
  --html              Génère un tableau de bord HTML statique (ailed-status.html), sans serveur
  --out=CHEMIN        Chemin du fichier HTML généré (défaut : ailed-status.html)

${c.dim("Sans flag et en terminal interactif, init pose les questions de configuration.")}
`);
}

(async () => {
  switch (command) {
    case "init":
      await init();
      break;
    case "status":
      status();
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
