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
    ticketing: flag("ticketing") || disabled,
    documentation: flag("docs") || disabled,
    // optional path to an existing conventions file to import verbatim ("" = none)
    conventions: flag("conventions") || "",
    // output verbosity for agents + reports (presentation only, never memory/ content)
    style: (flag("style") || "standard").toLowerCase(),
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
    !flag("ticketing") &&
    !flag("docs") &&
    !flag("conventions") &&
    !flag("style");

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
    cfg.ticketing = await ask(rl, "Ticketing externe (ex. Jira, via MCP) :", disabled);
    cfg.documentation = await ask(rl, "Documentation externe (ex. Confluence, via MCP) :", disabled);
    cfg.conventions = await ask(rl, "Fichier de conventions / organisation technique à importer (facultatif, Entrée = ignorer) :", "");
    cfg.style = (await ask(rl, "Style de sortie des agents/rapports (concis/standard/détaillé) :", "standard")).toLowerCase();
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
    .replace(/{{TICKETING}}/g, cfg.ticketing)
    .replace(/{{DOCUMENTATION}}/g, cfg.documentation)
    .replace(/{{DISABLED}}/g, cfg.disabled)
    .replace(/{{OUTPUT_STYLE}}/g, cfg.style || "standard")
    .replace(/{{DATE}}/g, now);
}

let created = 0;
let skipped = 0;

// ── recursive copy with placeholder substitution (.md only) ───
// forceOverwrite defaults to the global --force flag; callers (e.g. update)
// can override it per call to overwrite framework files while preserving data.
function copyTree(src, dest, cfg, forceOverwrite = force) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry), cfg, forceOverwrite);
    }
    return;
  }
  if (fs.existsSync(dest) && !forceOverwrite) {
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
    `\n${c.dim("Config")} : langue=${c.bold(cfg.lang)} · trigramme=${c.bold(cfg.trigram)} · monitoring=${cfg.monitoring} · e2e=${cfg.e2e} · promo=${cfg.promo} · veille=${cfg.watch} · seo/aso=${cfg.seo_aso} · ticketing=${cfg.ticketing} · doc=${cfg.documentation} · conventions=${cfg.conventions || cfg.disabled}\n`
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

// ── re-read the installed config from memory/config.md ────────
// Lets `update` re-apply the right placeholders without re-asking the user.
// Returns null if config.md is absent (project not initialized yet).
function parseInstalledConfig(memDir) {
  const p = path.join(memDir, "config.md");
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, "utf8");

  // language inferred from the title (set at install time, per language)
  const lang = /#\s*AI-Led Configuration/.test(txt) ? "en" : LANG_DEFAULT;
  const disabled = DISABLED_WORD[lang] || "none";
  const unbacktick = (s) => (s || "").replace(/`/g, "").trim();

  // trigram from the Identity section line (fr "Trigramme…" / en "…trigram…")
  const trig = txt.match(/trigram[^\n]*?`([^`]+)`/i);
  const trigram = ((trig ? trig[1] : deriveTrigram()).replace(/[^A-Za-z0-9]/g, "").slice(0, 5) || "PRJ").toUpperCase();

  const cfg = {
    lang,
    disabled,
    trigram,
    monitoring: disabled,
    e2e: disabled,
    promo: disabled,
    watch: disabled,
    seo_aso: disabled,
    ticketing: disabled,
    documentation: disabled,
    conventions: "",
    style: "standard",
  };

  // output style read from the dedicated bullet (fr "Style de communication…" / en "…communication style:")
  const st =
    txt.match(/communication style:?\s*`([^`]+)`/i) ||
    txt.match(/style de communication[^\n]*?`([^`]+)`/i);
  if (st) cfg.style = st[1].trim().toLowerCase();

  // integration values read from the Integrations table (label → key)
  const labels = [
    ["monitoring", /monitoring/i],
    ["e2e", /end-to-end/i],
    ["promo", /promo/i],
    ["watch", /veille|market watch/i],
    ["seo_aso", /seo/i],
    ["ticketing", /ticketing/i],
    ["documentation", /documentation/i],
  ];
  const seen = new Set();
  for (const line of txt.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").map((s) => s.trim());
    if (cells.length < 3) continue;
    const label = cells[1];
    const value = unbacktick(cells[2]);
    // skip header/separator rows and the unrelated coordinates table
    if (!value || /^(outil|tool|---)$/i.test(value)) continue;
    for (const [key, re] of labels) {
      if (!seen.has(key) && re.test(label)) {
        cfg[key] = value;
        seen.add(key);
        break;
      }
    }
  }
  return cfg;
}

// ── update: refresh framework files, preserve project data ────
// Overwrites .claude/{agents,skills,commands} (framework-owned) and adds any
// NEW memory/ files, while leaving existing memory/*.md and CLAUDE.md untouched.
async function update() {
  console.log(`\n${c.bold("AI-Led")} ${c.dim("v" + pkg.version)} — mise à jour dans ${c.cyan(cwd)}`);

  const memDir = path.join(cwd, "memory");
  const cfg = parseInstalledConfig(memDir);
  if (!cfg) {
    console.error(`\n${c.yellow("memory/config.md introuvable")} dans ${cwd}.`);
    console.error(`Ce projet n'a pas encore le framework. Lance d'abord : ${c.cyan("npx @s2bp/ai-led-framework init")}\n`);
    process.exit(1);
  }

  console.log(
    `\n${c.dim("Config relue depuis memory/config.md")} : langue=${c.bold(cfg.lang)} · trigramme=${c.bold(cfg.trigram)} · monitoring=${cfg.monitoring} · e2e=${cfg.e2e} · promo=${cfg.promo} · veille=${cfg.watch} · seo/aso=${cfg.seo_aso} · ticketing=${cfg.ticketing} · doc=${cfg.documentation} · style=${cfg.style}\n`
  );

  // 1. Agents — always overwritten (framework-owned)
  console.log(c.bold("Agents") + c.dim("  → .claude/agents/ (réécrits)"));
  copyTree(path.join(TPL, "claude", "agents"), path.join(cwd, ".claude", "agents"), cfg, true);

  // 2. Skills — always overwritten
  console.log("\n" + c.bold("Skills") + c.dim("  → .claude/skills/ (réécrits)"));
  const skillsSrc = path.join(TPL, "claude", "skills");
  for (const file of fs.readdirSync(skillsSrc)) {
    if (!file.endsWith(".md")) continue;
    const name = path.basename(file, ".md");
    copyTree(path.join(skillsSrc, file), path.join(cwd, ".claude", "skills", name, "SKILL.md"), cfg, true);
  }

  // 3. Commands — always overwritten
  console.log("\n" + c.bold("Commands") + c.dim("  → .claude/commands/ (réécrits)"));
  copyTree(path.join(TPL, "claude", "commands"), path.join(cwd, ".claude", "commands"), cfg, true);

  // 4. Memory — only NEW files added; existing project data preserved
  console.log("\n" + c.bold("Mémoire") + c.dim(`  → memory/ (nouveaux fichiers seulement · langue: ${cfg.lang})`));
  copyTree(path.join(TPL, "memory", cfg.lang), path.join(cwd, "memory"), cfg, false);

  // CLAUDE.md is left untouched on purpose (user-owned).

  console.log(
    `\n${c.green("✓")} Mise à jour terminée : ${c.bold(created)} fichier(s) écrit(s), ${skipped} préservé(s).`
  );
  console.log(
    c.dim(`  Framework réécrit en v${pkg.version} ; memory/*.md existants et CLAUDE.md préservés.`)
  );
  console.log(
    c.dim(`  Note : un agent/skill supprimé ou renommé dans une version plus récente n'est pas auto-nettoyé.\n`)
  );
}

const CLAUDE_MD_STUB = `# Projet piloté par AI-Led

Ce projet utilise le framework **AI-Led** : mémoire persistante (\`memory/\`),
agents préfixés \`ailed-*\` (\`.claude/agents/\`) et skills (\`.claude/skills/\`).

## Règles

- Aucun développement sans ticket ; aucun ticket sans SPEC validée par un humain.
- La mémoire \`memory/\` est la source de vérité : elle est lue avant et mise à jour après chaque tâche.
- \`memory/config.md\` fixe le trigramme de ticket (\`{{TICKET_PREFIX}}-*\`) et les intégrations outillage.
- \`memory/conventions.md\` (facultatif) décrit les conventions et l'organisation technique en place.

## Démarrage

Lance \`/ailed-bootstrap\`. Les agents disponibles (préfixe \`@ailed-\`, avec leurs entrées/sorties)
sont dans \`.claude/agents/\` ; les workflows (Discovery / Feature / Incident / Security) et leurs
points de validation humaine sont décrits dans \`memory/process.md\`.
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

// normalize a localized style word to one of: concise | standard | detailed
function canonStyle(s) {
  const v = (s || "").toLowerCase().trim();
  if (/^conci/.test(v)) return "concise";
  if (/détaill|detaill|detailed|verbeux|verbose/.test(v)) return "detailed";
  return "standard";
}

// read the output style from the parsed config memory entry
function readStyle(entries) {
  const cfg = entries.find((e) => e.name === "config");
  if (!cfg) return "standard";
  const m =
    cfg.content.match(/communication style:?\s*`([^`]+)`/i) ||
    cfg.content.match(/style de communication[^\n]*?`([^`]+)`/i);
  return canonStyle(m ? m[1] : "standard");
}

function tableCells(line) {
  return line.trim().split("|").slice(1, -1).map((s) => s.trim());
}
function isSeparatorRow(line) {
  return /^[-\s|]+$/.test(line.trim());
}

// parse the kanban markdown into { STATUS: [{id,title}] }, robust to extra tables/columns
function parseBoard(content) {
  const cols = {};
  for (const s of STATUSES) cols[s] = [];
  if (!content) return cols;
  let map = null;
  for (const line of content.split("\n")) {
    if (line.trim().charAt(0) !== "|") { map = null; continue; }
    const cs = tableCells(line);
    const lo = cs.map((c) => c.toLowerCase());
    if (lo.indexOf("status") >= 0 && (lo.indexOf("titre") >= 0 || lo.indexOf("title") >= 0)) {
      map = {
        status: lo.indexOf("status"),
        title: lo.indexOf("titre") >= 0 ? lo.indexOf("titre") : lo.indexOf("title"),
        id: lo.indexOf("id"),
      };
      continue;
    }
    if (isSeparatorRow(line) || !map) continue;
    const st = cs[map.status];
    if (STATUSES.indexOf(st) < 0) continue;
    cols[st].push({ id: map.id >= 0 ? cs[map.id] : "", title: map.title >= 0 ? cs[map.title] : "" });
  }
  return cols;
}

// parse roadmap milestones into [{name,target,delivered}]
function parseMilestones(content) {
  const out = [];
  if (!content) return out;
  let map = null;
  for (const line of content.split("\n")) {
    if (line.trim().charAt(0) !== "|") { map = null; continue; }
    const cs = tableCells(line);
    const lo = cs.map((c) => c.toLowerCase());
    if (lo.some((c) => /jalon|milestone/.test(c)) && lo.some((c) => /livraison|delivery/.test(c))) {
      map = {
        name: lo.findIndex((c) => /jalon|milestone/.test(c)),
        target: lo.findIndex((c) => /cible|target/.test(c)),
        delivered: lo.findIndex((c) => /livraison|delivery/.test(c)),
      };
      continue;
    }
    if (isSeparatorRow(line) || !map) continue;
    const raw = map.name >= 0 ? cs[map.name] : "";
    const name = raw.replace(/~~/g, "").trim();
    if (!name || /^—$/.test(name)) continue;
    const deliv = map.delivered >= 0 ? cs[map.delivered] : "";
    out.push({ name, target: map.target >= 0 ? cs[map.target] : "", delivered: !!(deliv && deliv !== "—") || /~~/.test(raw) });
  }
  return out;
}

function progressBar(pct, width) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
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

function statusTerminal(entries, memDirRel, style) {
  const kb = entries.find((e) => e.name === "kanban");
  const board = kb ? parseBoard(kb.content) : null;
  const tag = style !== "standard" ? c.dim(` · ${style}`) : "";
  console.log(`\n${c.bold("AI-Led")} ${c.dim("— état du projet")} · ${c.cyan(memDirRel)}${tag}\n`);

  // Synthèse visuelle : avancement + kanban (toujours affichés)
  if (board) {
    const total = STATUSES.reduce((n, s) => n + board[s].length, 0);
    const done = board.DONE.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    console.log(`  ${c.bold("Avancement")}  ${c.green(progressBar(pct, 24))} ${c.bold(pct + "%")}  ${c.dim(`(${done}/${total} tickets DONE)`)}`);
    console.log(`  ${c.bold("Kanban")}      ${STATUSES.map((s) => `${s} ${c.bold(board[s].length)}`).join("   ")}\n`);
  }

  // Fraîcheur des fichiers — omise en mode concis
  if (style !== "concise") {
    for (const e of entries) {
      let age;
      if (e.age === null) age = c.dim("(date ?)");
      else {
        const txt = `(maj il y a ${e.age} j)`;
        age = e.age > staleThreshold(e.name) ? c.yellow(txt) : c.dim(txt);
      }
      console.log(`  ${c.cyan(e.file.padEnd(18))} ${e.title}  ${age}`);
    }
    console.log("");
  }

  // Détaillé : prochains jalons + tickets en cours
  if (style === "detailed") {
    const rm = entries.find((e) => e.name === "roadmap");
    const miles = rm ? parseMilestones(rm.content).filter((m) => !m.delivered).slice(0, 5) : [];
    if (miles.length) {
      console.log(`${c.bold("Prochains jalons")}`);
      for (const m of miles) console.log(`  ${c.cyan("◷")} ${m.name}${m.target ? c.dim(" → " + m.target) : ""}`);
      console.log("");
    }
    if (board && board.IN_PROGRESS.length) {
      console.log(`${c.bold("En cours")}`);
      for (const t of board.IN_PROGRESS.slice(0, 10)) console.log(`  ${c.yellow("•")} ${t.id ? c.dim(t.id + " ") : ""}${t.title}`);
      console.log("");
    }
  }

  // À surveiller — toujours
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
  if (board && board.TO_CHECK.length) watch.push(`${board.TO_CHECK.length} clarification(s) TO_CHECK en attente`);
  if (watch.length) {
    console.log(`${c.bold("À surveiller")}`);
    for (const w of watch) console.log(`  ${c.yellow("•")} ${w}`);
    console.log("");
  }

  console.log(`${c.dim("Vue navigateur :")} npx @s2bp/ai-led-framework status --html`);
  console.log(`${c.dim("Synthèse enrichie dans Claude Code :")} /ailed-status\n`);
}

function statusHtml(entries, outPath, style) {
  const data = entries.map((e) => ({
    name: e.name, file: e.file, title: e.title, date: e.date, age: e.age, content: e.content,
  }));
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");
  fs.writeFileSync(
    outPath,
    HTML_TEMPLATE
      .replace("/*__DATA__*/", json)
      .replace(/__GENERATED__/g, generated)
      .replace(/__STYLE__/g, style || "standard")
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
  // --style flag overrides the config value for this run; otherwise read memory/config.md
  const style = flag("style") ? canonStyle(flag("style")) : readStyle(entries);
  if (argv.includes("--html")) {
    const out = path.resolve(cwd, flag("out") || "ailed-status.html");
    statusHtml(entries, out, style);
    console.log(`\n${c.green("✓")} Tableau de bord généré : ${c.cyan(path.relative(cwd, out) || out)}`);
    console.log(`  Ouvre-le dans un navigateur : ${c.dim("file://" + out)}\n`);
  } else {
    statusTerminal(entries, path.relative(cwd, memDir) || memDir, style);
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
  :root { --bg:#0f1117; --panel:#171a21; --panel2:#1d212b; --border:#252a34; --text:#e6e8eb; --muted:#8b929e; --accent:#6ea8fe; --warn:#f0c674; --ok:#6cc070; --danger:#e88;
    --sTO_CHECK:#c08be8; --sTODO:#8b929e; --sIN_PROGRESS:#6ea8fe; --sTO_TEST:#f0c674; --sDONE:#6cc070; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--text); }
  a { color:var(--accent); }
  header { padding:18px 28px; border-bottom:1px solid var(--border); display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  header h1 { margin:0; font-size:18px; }
  header .gen { color:var(--muted); font-size:13px; }
  .badges { display:flex; gap:7px; flex-wrap:wrap; margin-left:auto; }
  .badge { border-radius:999px; padding:3px 10px; font-size:12px; border:1px solid var(--border); }
  .badge.on { background:rgba(108,192,112,.12); border-color:rgba(108,192,112,.4); color:#bfe6c2; }
  .badge.off { background:var(--panel); color:var(--muted); text-decoration:line-through; }
  .badge.style { background:var(--panel); color:var(--muted); } .badge b { color:var(--text); }
  main { max-width:1120px; margin:0 auto; padding:24px 28px 80px; }
  h2.sec { font-size:13px; text-transform:uppercase; letter-spacing:.07em; color:var(--accent); margin:28px 0 12px; }
  .grid { display:grid; grid-template-columns:240px 1fr; gap:16px; align-items:stretch; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:760px){ .grid,.grid2{ grid-template-columns:1fr; } }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
  .card h3 { margin:0 0 10px; font-size:13px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
  .donutwrap { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; }
  .donutwrap .sub { color:var(--muted); font-size:13px; }
  .summary { font-size:15px; line-height:1.55; }
  .summary .none { color:var(--muted); font-style:italic; }
  .board { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }
  @media (max-width:760px){ .board{ grid-template-columns:1fr; } }
  .col { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:8px; min-height:60px; }
  .colh { font-size:12px; font-weight:600; padding:4px 6px 8px; display:flex; justify-content:space-between; border-bottom:2px solid var(--cc); margin-bottom:6px; }
  .colh b { font-size:15px; }
  .ticket { background:var(--panel2); border:1px solid var(--border); border-left:3px solid var(--cc); border-radius:6px; padding:6px 8px; margin-bottom:6px; font-size:13px; }
  .ticket .tid { display:block; color:var(--muted); font-size:11px; font-family:ui-monospace,monospace; }
  .col .empty, .tl .empty, .watch .empty { color:var(--muted); font-size:13px; font-style:italic; padding:4px 6px; }
  .tl { list-style:none; margin:0; padding:0; }
  .tl li { padding:6px 0 6px 4px; border-left:2px solid var(--border); padding-left:14px; position:relative; }
  .tl li span { font-weight:500; } .tl li em { color:var(--muted); font-style:normal; font-size:12px; margin-left:8px; }
  .tl li.done { color:var(--muted); } .tl li.done span { text-decoration:line-through; }
  .watch { list-style:none; margin:0; padding:0; }
  .watch li { padding:6px 0 6px 18px; position:relative; font-size:14px; }
  .watch li:before { content:"•"; color:var(--warn); position:absolute; left:2px; }
  .toc { display:flex; gap:7px; flex-wrap:wrap; margin:6px 0 14px; }
  .toc a { font-size:12px; background:var(--panel); border:1px solid var(--border); border-radius:999px; padding:3px 11px; text-decoration:none; color:var(--text); }
  .toc a .dot { color:var(--warn); } .toc a:hover { border-color:var(--accent); }
  details.file { background:var(--panel); border:1px solid var(--border); border-radius:10px; margin-bottom:8px; }
  details.file > summary { cursor:pointer; padding:11px 16px; list-style:none; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  details.file > summary::-webkit-details-marker { display:none; }
  details.file > summary:before { content:"▸"; color:var(--muted); } details.file[open] > summary:before { content:"▾"; }
  details.file > summary .sf { font-family:ui-monospace,monospace; font-size:12px; color:var(--accent); }
  details.file > summary .st { margin-left:auto; color:var(--muted); font-size:12px; }
  details.file .md { padding:2px 18px 16px; border-top:1px solid var(--border); }
  .toggle { background:var(--panel); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 14px; cursor:pointer; font-size:14px; }
  .toggle:hover { border-color:var(--accent); }
  .md table { border-collapse:collapse; width:100%; margin:12px 0; font-size:14px; display:block; overflow-x:auto; }
  .md th, .md td { border:1px solid var(--border); padding:6px 10px; text-align:left; vertical-align:top; }
  .md th { background:var(--panel2); }
  .md code { background:var(--panel2); padding:1px 5px; border-radius:4px; font-size:13px; }
  .md pre { background:var(--panel2); padding:12px; border-radius:8px; overflow:auto; }
  .md h1 { display:none; } .md h2, .md h3 { margin-top:18px; }
  .mermaid { background:#fff; border-radius:8px; padding:12px; margin:12px 0; }
</style>
</head>
<body>
<header>
  <h1>AI-Led — Tableau de bord</h1>
  <span class="gen">généré le __GENERATED__ · lecture seule</span>
  <div class="badges" id="badges"></div>
</header>
<main>
  <div id="synth"></div>
  <h2 class="sec">Détail de la mémoire</h2>
  <div id="toc" class="toc"></div>
  <div id="detail"></div>
</main>
<script>
  var DATA = /*__DATA__*/;
  var STYLE = "__STYLE__";
  var STATUSES = ['TO_CHECK','TODO','IN_PROGRESS','TO_TEST','DONE'];
  var LABEL = {TO_CHECK:'À vérifier',TODO:'À faire',IN_PROGRESS:'En cours',TO_TEST:'À tester',DONE:'Terminé'};
  function staleLimit(name){ return name === 'market-watch' ? 30 : 60; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function get(name){ return DATA.filter(function(e){ return e.name===name; })[0]; }
  function cells(line){ return line.trim().split('|').slice(1,-1).map(function(s){ return s.trim(); }); }
  function isSep(line){ return /^[-\\s|]+$/.test(line.trim()); }

  function parseBoard(md){
    var cols={}; STATUSES.forEach(function(s){ cols[s]=[]; });
    if(!md) return cols; var map=null;
    md.split('\\n').forEach(function(line){
      if(line.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(line), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.indexOf('status')>=0 && (lo.indexOf('titre')>=0||lo.indexOf('title')>=0)){
        map={ status:lo.indexOf('status'), title:lo.indexOf('titre')>=0?lo.indexOf('titre'):lo.indexOf('title'), id:lo.indexOf('id') };
        return;
      }
      if(isSep(line)||!map) return;
      var st=cs[map.status];
      if(STATUSES.indexOf(st)<0) return;
      cols[st].push({ id:map.id>=0?cs[map.id]:'', title:map.title>=0?cs[map.title]:'' });
    });
    return cols;
  }
  function parseMilestones(md){
    var out=[]; if(!md) return out; var map=null;
    md.split('\\n').forEach(function(line){
      if(line.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(line), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.some(function(c){return /jalon|milestone/.test(c);}) && lo.some(function(c){return /livraison|delivery/.test(c);})){
        map={ name:lo.findIndex(function(c){return /jalon|milestone/.test(c);}), target:lo.findIndex(function(c){return /cible|target/.test(c);}), deliv:lo.findIndex(function(c){return /livraison|delivery/.test(c);}) };
        return;
      }
      if(isSep(line)||!map) return;
      var raw=map.name>=0?cs[map.name]:''; var name=raw.replace(/~~/g,'').trim();
      if(!name||name==='—') return;
      var d=map.deliv>=0?cs[map.deliv]:'';
      out.push({ name:name, target:map.target>=0?cs[map.target]:'', delivered:(!!d && d!=='—')||/~~/.test(raw) });
    });
    return out;
  }
  function parseIntegrations(md){
    var out=[]; if(!md) return out; var inSec=false;
    md.split('\\n').forEach(function(line){
      if(/^##\\s/.test(line)){ inSec=/^##\\s+(Integrations|Intégrations)/i.test(line); return; }
      if(/^###/.test(line)){ inSec=false; return; }
      if(!inSec || line.trim().charAt(0)!=='|' || isSep(line)) return;
      var cs=cells(line); if(cs.length<2) return;
      var area=cs[0], tool=cs[1].replace(/\`/g,'').trim();
      if(!area || /area|domaine|---/i.test(area)) return;
      out.push({ area:area, tool:tool, on: !!tool && !/^(aucun|none|—)$/i.test(tool) && !/^\\{\\{.*\\}\\}$/.test(tool) });
    });
    return out;
  }
  function stateSummary(md){
    if(!md) return ''; var lines=md.split('\\n'), grab=false, buf=[];
    for(var i=0;i<lines.length;i++){
      var l=lines[i];
      if(/^##\\s/.test(l)){ grab=/^##\\s+(État actuel|Current state)/i.test(l); continue; }
      if(grab){ var t=l.trim(); if(t) buf.push(t); }
    }
    var s=buf.join(' ').trim();
    if(!s || /^TO IDENTIFY/i.test(s)) return ''; return s;
  }
  function donut(pct){
    var r=44, cir=2*Math.PI*r, off=cir*(1-pct/100);
    return '<svg width="120" height="120" viewBox="0 0 120 120">'
      +'<circle cx="60" cy="60" r="'+r+'" fill="none" stroke="var(--border)" stroke-width="12"/>'
      +'<circle cx="60" cy="60" r="'+r+'" fill="none" stroke="var(--ok)" stroke-width="12" stroke-linecap="round" stroke-dasharray="'+cir+'" stroke-dashoffset="'+off+'" transform="rotate(-90 60 60)"/>'
      +'<text x="60" y="60" text-anchor="middle" dominant-baseline="central" font-size="24" font-weight="700" fill="var(--text)">'+pct+'%</text></svg>';
  }

  // ── Synthèse ──────────────────────────────────────────────
  var cfg=get('config'); var integ=parseIntegrations(cfg&&cfg.content);
  var badges = integ.map(function(it){
    return it.on ? '<span class="badge on">'+esc(it.area)+' <b>'+esc(it.tool)+'</b></span>'
                 : '<span class="badge off">'+esc(it.area)+'</span>';
  }).join('') + '<span class="badge style">style&nbsp;<b>'+esc(STYLE)+'</b></span>';
  document.getElementById('badges').innerHTML = badges;

  var board = parseBoard((get('kanban')||{}).content);
  var total = STATUSES.reduce(function(n,s){ return n+board[s].length; },0);
  var done = board.DONE.length;
  var pct = total ? Math.round(done/total*100) : 0;
  var summary = stateSummary((get('project-state')||{}).content);

  var boardHtml = STATUSES.map(function(s){
    var cssVar = 'var(--s'+s+')';
    var cards = board[s].length ? board[s].map(function(t){
      return '<div class="ticket" style="--cc:'+cssVar+'">'+(t.id?'<span class="tid">'+esc(t.id)+'</span>':'')+esc(t.title||'(sans titre)')+'</div>';
    }).join('') : '<div class="empty">—</div>';
    return '<div class="col" style="--cc:'+cssVar+'"><div class="colh" style="--cc:'+cssVar+'"><span>'+LABEL[s]+'</span><b>'+board[s].length+'</b></div>'+cards+'</div>';
  }).join('');

  var miles = parseMilestones((get('roadmap')||{}).content);
  var milesHtml = miles.length ? miles.map(function(m){
    return '<li class="'+(m.delivered?'done':'')+'">'+(m.delivered?'✓ ':'◷ ')+'<span>'+esc(m.name)+'</span>'+(m.target&&!m.delivered?'<em>'+esc(m.target)+'</em>':'')+'</li>';
  }).join('') : '<li class="empty">Aucun jalon défini</li>';

  var watch=[];
  DATA.forEach(function(e){ if(e.age!==null && e.age>staleLimit(e.name)) watch.push(esc(e.file)+' — '+e.age+' j sans mise à jour'); });
  var off = integ.filter(function(it){ return !it.on; }).map(function(it){ return esc(it.area); });
  if(off.length) watch.push('Intégrations désactivées : '+off.join(', '));
  if(board.TO_CHECK.length) watch.push(board.TO_CHECK.length+' clarification(s) TO_CHECK en attente');
  var watchHtml = watch.length ? watch.map(function(w){ return '<li>'+w+'</li>'; }).join('') : '<li class="empty">Rien à signaler</li>';

  document.getElementById('synth').innerHTML =
    '<h2 class="sec">Synthèse</h2>'
    + '<div class="grid">'
    +   '<div class="card donutwrap">'+donut(pct)+'<div class="sub">'+done+' / '+total+' tickets terminés</div></div>'
    +   '<div class="card"><h3>État actuel</h3><div class="summary">'+(summary?esc(summary):'<span class="none">Non renseigné (project-state.md)</span>')+'</div></div>'
    + '</div>'
    + '<h2 class="sec">Kanban</h2><div class="board">'+boardHtml+'</div>'
    + '<div class="grid2" style="margin-top:16px">'
    +   '<div class="card"><h3>Roadmap — jalons</h3><ul class="tl">'+milesHtml+'</ul></div>'
    +   '<div class="card"><h3>À surveiller</h3><ul class="watch">'+watchHtml+'</ul></div>'
    + '</div>';

  // ── Détail (replié) ───────────────────────────────────────
  var open = STYLE==='detailed' ? ' open' : '';
  var toc='', det='';
  DATA.forEach(function(e){
    var stale=(e.age!==null && e.age>staleLimit(e.name));
    toc += '<a href="#f-'+e.name+'" data-t="f-'+e.name+'">'+esc(e.title)+(stale?' <span class="dot">●</span>':'')+'</a>';
    var stamp = e.date ? ('maj '+e.date+(e.age!==null?(' · '+e.age+' j'+(stale?' — périmé':'')):'')) : 'date inconnue';
    det += '<details class="file" id="f-'+e.name+'"'+open+'><summary><span class="sf">'+esc(e.file)+'</span> '+esc(e.title)+'<span class="st">'+stamp+'</span></summary><div class="md">'+marked.parse(e.content)+'</div></details>';
  });
  document.getElementById('toc').innerHTML = toc;
  document.getElementById('detail').innerHTML = det;

  // clic sur une puce du sommaire → ouvre l'accordéon ciblé
  document.getElementById('toc').addEventListener('click', function(ev){
    var a = ev.target.closest('a'); if(!a) return;
    var el = document.getElementById(a.getAttribute('data-t')); if(el) el.open = true;
  });

  document.querySelectorAll('code.language-mermaid').forEach(function(code){
    var div = document.createElement('div'); div.className='mermaid'; div.textContent = code.textContent;
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
  update          Met à jour le framework (agents/skills/commands) en préservant memory/ et CLAUDE.md
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
  --ticketing=NOM     Ticketing externe (ex. Jira, via MCP) ou désactivé (défaut)
  --docs=NOM          Documentation externe (ex. Confluence, via MCP) ou désactivé (défaut)
  --style=NIVEAU      Style de sortie agents/rapports : concis | standard | détaillé (défaut : standard)
  --conventions=CHEMIN  Importe un fichier de conventions/organisation technique dans memory/conventions.md (facultatif)
  -y, --yes           Mode non interactif (valeurs par défaut / flags fournis)
  -f, --force         Écrase les fichiers existants (par défaut : ignorés)

${c.bold("update")}
  Réécrit .claude/agents, .claude/skills et .claude/commands en dernière version,
  ajoute les nouveaux fichiers memory/, et préserve memory/*.md et CLAUDE.md existants.
  La config (trigramme, intégrations, langue) est relue depuis memory/config.md.
  ${c.dim("Astuce : npx @s2bp/ai-led-framework@latest update  pour contourner le cache npx.")}

${c.bold("Options de status")}
  --html              Génère un tableau de bord HTML statique (ailed-status.html), sans serveur
  --out=CHEMIN        Chemin du fichier HTML généré (défaut : ailed-status.html)
  --style=NIVEAU      Force le style pour ce run : concis | standard | détaillé (sinon lu dans memory/config.md)

  Le terminal et le HTML montrent d'abord une synthèse (avancement, board kanban, jalons,
  « à surveiller ») ; le HTML met le détail des fichiers memory/ dans des accordéons repliés.

${c.dim("Sans flag et en terminal interactif, init pose les questions de configuration.")}
`);
}

(async () => {
  switch (command) {
    case "init":
      await init();
      break;
    case "update":
      await update();
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
