#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

// ── per-agent LLM model policy ────────────────────────────────
// Default tiering: which Claude model each agent runs on. The harness reads this
// from each agent's frontmatter (`model:`), NOT from config.md at runtime — so we
// render it into the frontmatter at install and mirror it into config.md as the
// human-editable source of truth (change it there, then `ai-led models sync`).
//   opus   = deep reasoning / judgment / high leverage (a bad output costs rework)
//   sonnet = capable standard execution, high volume
//   haiku  = mechanical collection / extraction, little reasoning
const MODEL_TIERS = ["opus", "sonnet", "haiku", "inherit"];
const AGENT_MODEL_TIERS = {
  // reasoning / judgment / critical review
  "ailed-brainstorm": "opus",
  "ailed-architect": "opus",
  "ailed-planner": "opus",
  "ailed-pm": "opus",
  "ailed-analyst": "opus",
  "ailed-review": "opus",
  "ailed-security-review": "opus",
  "ailed-rca": "opus",
  // standard execution
  "ailed-dev": "sonnet",
  "ailed-ux": "sonnet",
  "ailed-test": "sonnet",
  "ailed-communication": "sonnet",
  "ailed-seo-aso": "sonnet",
  "ailed-monetization": "sonnet",
  "ailed-knowledge-audit": "sonnet",
  "ailed-release": "sonnet",
  "ailed-fact-check": "sonnet",
  "ailed-check-secu": "sonnet",
  "ailed-init-memory": "sonnet",
  // mechanical collection / extraction
  "ailed-scout": "haiku",
  "ailed-check-log": "haiku",
};

// resolve the effective per-agent model map: defaults, overridable per agent via
// `--model-<name>=<tier>` (name without the `ailed-` prefix, e.g. --model-dev=opus)
function resolveModels() {
  const models = { ...AGENT_MODEL_TIERS };
  for (const agent of Object.keys(models)) {
    const short = agent.replace(/^ailed-/, "");
    const v = flag(`model-${short}`);
    if (v && MODEL_TIERS.includes(v.toLowerCase())) models[agent] = v.toLowerCase();
  }
  return models;
}

// render the config.md model table (round-trips with parseModelsTable)
function renderModelsTable(models, lang) {
  const head = lang === "en" ? "| Agent | Model |" : "| Agent | Modèle |";
  const rows = Object.keys(models)
    .sort((a, b) => {
      const ord = { opus: 0, sonnet: 1, haiku: 2, inherit: 3 };
      return (ord[models[a]] - ord[models[b]]) || a.localeCompare(b);
    })
    .map((a) => `| \`${a}\` | \`${models[a]}\` |`);
  return [head, "| ----- | ------ |", ...rows].join("\n");
}

// parse the model table back out of config.md text → { agent: tier }
function parseModelsTable(txt) {
  const models = {};
  for (const line of txt.split("\n")) {
    const m = line.match(/^\|\s*`?(ailed-[a-z-]+)`?\s*\|\s*`?(opus|sonnet|haiku|inherit)`?\s*\|/i);
    if (m) models[m[1].toLowerCase()] = m[2].toLowerCase();
  }
  return models;
}

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
    // per-agent LLM model map (defaults + --model-<name> overrides)
    models: resolveModels(),
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
// agentName (basename without .md) lets agent files resolve their own {{MODEL}}.
function substitute(content, cfg, agentName) {
  const now = new Date().toISOString().slice(0, 10);
  const models = cfg.models || AGENT_MODEL_TIERS;
  const model = (agentName && models[agentName]) || "inherit";
  return content
    .replace(/{{MODEL}}/g, model)
    .replace(/{{MODELS_TABLE}}/g, () => renderModelsTable(models, cfg.lang))
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
    fs.writeFileSync(dest, substitute(fs.readFileSync(src, "utf8"), cfg, path.basename(dest, ".md")));
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

// ── runtime hook install (feeds `ai-led watch`) ───────────────
// Copies the hook script, wires the Task PreToolUse/PostToolUse hooks into
// .claude/settings.json (without clobbering existing settings), and gitignores
// the .ailed/ runtime state directory.
function installRuntimeHook(cfg, forceOverwrite) {
  console.log("\n" + c.bold("Hook") + c.dim("  → .claude/hooks/ (panneau de progression)"));
  copyTree(
    path.join(TPL, "claude", "hooks", "ailed-runtime-hook.js"),
    path.join(cwd, ".claude", "hooks", "ailed-runtime-hook.js"),
    cfg,
    forceOverwrite
  );
  mergeHookSettings();
  ensureGitignore();
}

function mergeHookSettings() {
  const p = path.join(cwd, ".claude", "settings.json");
  let s = {};
  if (fs.existsSync(p)) {
    try { s = JSON.parse(fs.readFileSync(p, "utf8")) || {}; }
    catch (_) {
      console.log(`  ${c.yellow("skip")} .claude/settings.json ${c.dim("(illisible — câble le hook à la main, voir README)")}`);
      return;
    }
  }
  s.hooks = s.hooks || {};
  const cmd = (phase) => `node "$CLAUDE_PROJECT_DIR/.claude/hooks/ailed-runtime-hook.js" ${phase}`;
  const refsAiled = (e) =>
    (e && Array.isArray(e.hooks) ? e.hooks : []).some(
      (h) => h && typeof h.command === "string" && h.command.includes("ailed-runtime-hook")
    );
  // Desired wiring: PreToolUse on every tool (main-loop heartbeat + Task agents),
  // PostToolUse on Task only (agent completion + /clear nudge). Self-healing: drop
  // any prior ailed entries first so older "Task"-only PreToolUse wiring is upgraded.
  const wire = (event, matcher, phase) => {
    const arr = Array.isArray(s.hooks[event]) ? s.hooks[event] : [];
    const before = JSON.stringify(arr);
    const next = arr
      .filter((e) => !refsAiled(e))
      .concat([{ matcher, hooks: [{ type: "command", command: cmd(phase) }] }]);
    s.hooks[event] = next;
    return before !== JSON.stringify(next);
  };
  const a = wire("PreToolUse", "*", "pre");
  const b = wire("PostToolUse", "Task", "post");
  if (a || b) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
    console.log(`  ${c.green("+")}    .claude/settings.json ${c.dim("(hooks Task + activité câblés)")}`);
  } else {
    console.log(`  ${c.yellow("skip")} .claude/settings.json ${c.dim("(hooks déjà à jour)")}`);
  }
}

function ensureGitignore() {
  const p = path.join(cwd, ".gitignore");
  let txt = "";
  if (fs.existsSync(p)) txt = fs.readFileSync(p, "utf8");
  if (txt.split("\n").some((l) => l.trim() === ".ailed/" || l.trim() === ".ailed")) return;
  const add = (txt && !txt.endsWith("\n") ? "\n" : "") + "\n# AI-Led runtime (progress sidebar state)\n.ailed/\n";
  fs.writeFileSync(p, txt + add);
  console.log(`  ${c.green("+")}    .gitignore ${c.dim("(+ .ailed/)")}`);
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

  // 3b. Runtime hook (progress sidebar) -> .claude/hooks/ + settings.json + .gitignore
  installRuntimeHook(cfg, force);

  // 4. Memory  ->  memory/  (from the chosen language folder)
  console.log("\n" + c.bold("Mémoire") + c.dim(`  → memory/ (langue: ${cfg.lang})`));
  copyTree(path.join(TPL, "memory", cfg.lang), path.join(cwd, "memory"), cfg);

  // 4b. Optional: import an existing conventions file verbatim into memory/conventions.md
  if (cfg.conventions) importConventions(cfg);

  // 4c. Record memory baselines so a later `update` can cleanly refresh the
  //     files the user never edits. An imported conventions.md is NOT the
  //     template, so exclude it (else update would wipe it as "pristine").
  recordMemoryManifest(cfg, path.join(cwd, "memory"), cwd, cfg.conventions ? new Set(["conventions.md"]) : new Set());

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
    // per-agent models: defaults overlaid with whatever the config.md table declares
    models: { ...AGENT_MODEL_TIERS, ...parseModelsTable(txt) },
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
  // Scope the scan to the Integrations section only. Other tables (notably the
  // per-agent LLM models table, which has rows like `| ailed-seo-aso | sonnet |`)
  // would otherwise hijack labels such as /seo/i and poison the parsed value.
  const seen = new Set();
  let inIntegrations = false;
  for (const line of txt.split("\n")) {
    // only a level-2 heading opens/closes the section; deeper ### subsections
    // (e.g. "### Ticketing & documentation externes") stay in scope.
    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      inIntegrations = /int[ée]grations?/i.test(h2[1]);
      continue;
    }
    if (!inIntegrations) continue;
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

// ── memory update: manifest + additive section merge ─────────
// memory/ mixes two natures: framework-owned scaffolding whose *structure*
// evolves (config.md, process.md) and pure project data (everything else).
// `update` must bring structural changes in without ever clobbering user data.
const FRAMEWORK_MEMORY = new Set(["config.md", "process.md"]);

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function manifestPath(projectDir) { return path.join(projectDir, ".ailed", "manifest.json"); }

// The manifest records the hash of the exact template bytes we wrote for each
// memory file. On the next update, a file whose current hash still matches is
// "pristine" (never edited locally) → safe to refresh in full. It lives under
// the gitignored .ailed/, so it's per-clone: teammates without it fall back to
// the safe path (data preserved, framework files section-merged).
function readManifest(projectDir) {
  try {
    const p = manifestPath(projectDir);
    if (!fs.existsSync(p)) return null;
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!m || typeof m !== "object") return null;
    m.memory = m.memory || {};
    return m;
  } catch (_) { return null; }
}

function writeManifest(projectDir, man) {
  try {
    fs.mkdirSync(path.join(projectDir, ".ailed"), { recursive: true });
    fs.writeFileSync(manifestPath(projectDir), JSON.stringify(man, null, 2) + "\n");
  } catch (_) { /* best-effort — pristine detection just degrades to "preserve" */ }
}

// Record baselines for freshly-installed memory files so a later `update` can
// cleanly refresh the ones the user never touched. `skip` excludes files whose
// on-disk content is NOT the template (e.g. an imported conventions.md), so they
// are never mistaken for pristine and overwritten.
function recordMemoryManifest(cfg, memDir, projectDir, skip = new Set()) {
  const man = { version: pkg.version, lang: cfg.lang, memory: {} };
  try {
    for (const file of fs.readdirSync(memDir)) {
      if (!file.endsWith(".md") || skip.has(file)) continue;
      man.memory[file] = sha256(fs.readFileSync(path.join(memDir, file), "utf8"));
    }
  } catch (_) { /* best-effort */ }
  writeManifest(projectDir, man);
}

// Split markdown into a leading preamble + a flat list of ATX-heading-delimited
// sections. Concatenating pre + every section's lines reproduces the input
// verbatim, so an insert-only merge leaves untouched sections byte-for-byte.
function splitSectionsLines(md) {
  const lines = md.split("\n");
  const isHeading = (l) => /^#{1,6}\s+\S/.test(l);
  const norm = (l) => l.replace(/^#{1,6}\s+/, "").trim().toLowerCase().replace(/\s+/g, " ");
  const title = (l) => l.replace(/^#{1,6}\s+/, "").trim();
  let i = 0;
  const pre = [];
  while (i < lines.length && !isHeading(lines[i])) pre.push(lines[i++]);
  const sections = [];
  while (i < lines.length) {
    const start = i++;
    while (i < lines.length && !isHeading(lines[i])) i++;
    sections.push({ key: norm(lines[start]), title: title(lines[start]), lines: lines.slice(start, i) });
  }
  return { pre, sections };
}

// Additive merge: insert the template sections the user is missing (in template
// order, each right after its preceding matched section), substitution already
// applied. Never edits or removes existing sections. `changed` reports sections
// present on both sides whose body differs — surfaced, not touched.
function mergeSections(userMd, tplMd) {
  const u = splitSectionsLines(userMd);
  const t = splitSectionsLines(tplMd);
  const have = new Set(u.sections.map((s) => s.key));
  const tByKey = new Map(t.sections.map((s) => [s.key, s]));
  const normBody = (ls) => ls.join("\n").replace(/\s+/g, " ").trim();

  const added = [], changed = [];
  for (const us of u.sections) {
    const ts = tByKey.get(us.key);
    if (ts && normBody(us.lines) !== normBody(ts.lines)) changed.push(us.title);
  }

  // group missing template sections under the anchor they should follow
  const insertAfter = new Map(); // anchorKey | "__pre__" -> [section]
  let anchor = "__pre__";
  for (const ts of t.sections) {
    if (have.has(ts.key)) { anchor = ts.key; continue; }
    if (!insertAfter.has(anchor)) insertAfter.set(anchor, []);
    insertAfter.get(anchor).push(ts);
    added.push(ts.title);
  }
  if (!added.length) return { merged: userMd, added, changed };

  const out = [];
  const emit = (ls) => {
    if (out.length && out[out.length - 1].trim() !== "") out.push(""); // ≥1 blank between blocks
    for (const l of ls) out.push(l);
  };
  for (const l of u.pre) out.push(l);
  for (const ts of insertAfter.get("__pre__") || []) emit(ts.lines);
  for (const us of u.sections) {
    emit(us.lines);
    for (const ts of insertAfter.get(us.key) || []) emit(ts.lines);
  }
  let merged = out.join("\n");
  if (!merged.endsWith("\n")) merged += "\n";
  return { merged, added, changed };
}

// memory/ refresh for `update`: pristine files get a clean full rewrite,
// framework files that were edited get an additive section merge, and edited
// project-data files are preserved. Updates the manifest as it goes.
function updateMemory(cfg, memDir, projectDir) {
  console.log("\n" + c.bold("Mémoire") + c.dim(`  → memory/ (fusion structurelle · langue: ${cfg.lang})`));
  const src = path.join(TPL, "memory", cfg.lang);
  const man = readManifest(projectDir) || { version: pkg.version, lang: cfg.lang, memory: {} };
  man.memory = man.memory || {};

  for (const file of fs.readdirSync(src)) {
    if (!file.endsWith(".md")) continue;
    const rel = path.join("memory", file);
    const dest = path.join(memDir, file);
    const rendered = substitute(fs.readFileSync(path.join(src, file), "utf8"), cfg, path.basename(file, ".md"));

    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, rendered);
      man.memory[file] = sha256(rendered);
      created++;
      console.log(`  ${c.green("+")}    ${rel} ${c.dim("(nouveau)")}`);
      continue;
    }

    const current = fs.readFileSync(dest, "utf8");
    const baseline = man.memory[file];

    // pristine: never edited since last install/update → clean full refresh
    if (baseline && sha256(current) === baseline) {
      if (rendered !== current) {
        fs.writeFileSync(dest, rendered);
        man.memory[file] = sha256(rendered);
        created++;
        console.log(`  ${c.green("↻")}    ${rel} ${c.dim("(réécrit — non modifié en local)")}`);
      } else {
        skipped++;
        console.log(`  ${c.dim("=")}    ${rel} ${c.dim("(à jour)")}`);
      }
      continue;
    }

    // edited locally (or no baseline): framework files get additive sections,
    // project data is preserved verbatim.
    if (FRAMEWORK_MEMORY.has(file)) {
      const { merged, added, changed } = mergeSections(current, rendered);
      if (added.length) {
        fs.writeFileSync(dest, merged);
        // merged = framework sections + user edits → never mark pristine again.
        delete man.memory[file];
        created++;
        console.log(`  ${c.green("+")}    ${rel} ${c.dim(`(+${added.length} section(s) : ${added.join(", ")})`)}`);
      } else {
        skipped++;
        console.log(`  ${c.yellow("skip")} ${rel} ${c.dim("(aucune section manquante)")}`);
      }
      if (changed.length) {
        console.log(`         ${c.dim(`↳ ${changed.length} section(s) diffèrent du template — conservées telles quelles : ${changed.join(", ")}`)}`);
      }
    } else {
      skipped++;
      console.log(`  ${c.yellow("skip")} ${rel} ${c.dim("(données projet — préservé)")}`);
    }
  }

  man.version = pkg.version;
  man.lang = cfg.lang;
  writeManifest(projectDir, man);
}

// ── update: refresh framework files, preserve project data ────
// Overwrites .claude/{agents,skills,commands} (framework-owned), refreshes
// memory/ via updateMemory (pristine → rewrite · framework → section-merge ·
// data → preserve), and leaves CLAUDE.md untouched.
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

  // 3b. Runtime hook — refreshed and (re)wired into settings.json
  installRuntimeHook(cfg, true);

  // 4. Memory — pristine files refreshed, framework files section-merged,
  //    project data preserved (see updateMemory).
  updateMemory(cfg, memDir, cwd);

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

// Normalise a raw kanban status cell into a canonical STATUSES value, tolerant to
// the way statuses are actually written in the wild: backticks (the template styles
// them as `IN_PROGRESS`), lower/mixed case, accents, spaces/hyphens, FR/EN wording.
// Returns null when nothing plausible matches (row is then skipped, as before).
function normStatus(raw) {
  const v = String(raw || "")
    .replace(/`/g, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!v) return null;
  if (STATUSES.indexOf(v) >= 0) return v;
  if (/^(IN_?PROGRESS|EN_?COURS|WIP|DOING|ONGOING)$/.test(v)) return "IN_PROGRESS";
  if (/^(DONE|TERMINE|LIVRE|CLOS|CLOSED|FERME|MERGED?)$/.test(v)) return "DONE";
  if (/^(TO_?TEST|A_?TESTER|TESTING|TEST|IN_?TEST)$/.test(v)) return "TO_TEST";
  if (/^(TO_?CHECK|A_?VERIFIER|CK|TO_?CLARIFY)$/.test(v)) return "TO_CHECK";
  if (/^(TODO|A_?FAIRE|BACKLOG|OPEN|NEW)$/.test(v)) return "TODO";
  return null;
}

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
    const st = normStatus(cs[map.status]);
    if (!st) continue;
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
  // Embed as JSON inside an inline <script>. Guard the three sequences that are
  // valid in JSON but break an inline script: `</…` (closes the tag early) and the
  // U+2028/U+2029 line separators (illegal in older JS string literals).
  const json = JSON.stringify(data)
    .replace(/<\//g, "<\\/")
    .replace(/[\u2028\u2029]/g, (m) => "\\u" + m.charCodeAt(0).toString(16));
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");
  // IMPORTANT: pass function replacements so `$`-sequences in the injected values
  // (`$&`, `$\``, `$'`, `$1`… — common in code/prices/apostrophes inside memory
  // content) are inserted literally instead of triggering replace's special patterns.
  fs.writeFileSync(
    outPath,
    HTML_TEMPLATE
      .replace("/*__DATA__*/", () => json)
      .replace(/__GENERATED__/g, () => generated)
      .replace(/__STYLE__/g, () => style || "standard")
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
    // default filename is prefixed with a local YYYYMMDDHHmmss stamp so each run
    // produces a distinct, chronologically-sortable report (overridable via --out).
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const out = path.resolve(cwd, flag("out") || `${stamp}_ailed-status.html`);
    statusHtml(entries, out, style);
    console.log(`\n${c.green("✓")} Tableau de bord généré : ${c.cyan(path.relative(cwd, out) || out)}`);
    console.log(`  Ouvre-le dans un navigateur : ${c.dim("file://" + out)}\n`);
  } else {
    statusTerminal(entries, path.relative(cwd, memDir) || memDir, style);
  }
}

const HTML_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI-Led — Dashboard</title>
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
  .badges { display:flex; gap:7px; flex-wrap:wrap; flex-basis:100%; margin-top:8px; }
  .badge { border-radius:999px; padding:3px 10px; font-size:12px; border:1px solid var(--border); }
  .badge.on { background:rgba(108,192,112,.12); border-color:rgba(108,192,112,.4); color:#bfe6c2; }
  .badge.off { background:var(--panel); color:var(--muted); text-decoration:line-through; }
  .badge.style { background:var(--panel); color:var(--muted); } .badge b { color:var(--text); }
  main { max-width:1120px; margin:0 auto; padding:24px 28px 80px; }
  h2.sec { font-size:13px; text-transform:uppercase; letter-spacing:.07em; color:var(--accent); margin:28px 0 12px; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
  .card h3 { margin:0 0 10px; font-size:13px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
  .watch .empty { color:var(--muted); font-size:13px; font-style:italic; padding:4px 6px; }
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
  .toggle { background:var(--panel); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px 14px; cursor:pointer; font-size:14px; margin:8px 0 4px; }
  .toggle:hover { border-color:var(--accent); }
  .lede { color:var(--muted); font-size:14px; margin:0 0 14px; }
  /* KPIs : 2 camemberts + bloc de chiffres */
  .kpis { display:grid; grid-template-columns:1fr 1fr 1.15fr; gap:16px; align-items:stretch; }
  @media (max-width:880px){ .kpis{ grid-template-columns:1fr; } }
  .pie-card { display:flex; gap:16px; align-items:center; }
  .pie-card .piefig { flex:0 0 auto; }
  .pie-card .pieinfo { min-width:0; flex:1; }
  .pie-pct { font-size:30px; font-weight:700; line-height:1; }
  .pie-pct .approx { font-size:12px; font-weight:500; color:var(--muted); margin-left:5px; }
  .pie-sub { color:var(--muted); font-size:13px; margin-top:3px; }
  .legend { list-style:none; margin:12px 0 0; padding:0; font-size:12.5px; }
  .legend li { display:flex; align-items:center; gap:7px; padding:2px 0; color:var(--muted); }
  .legend .ldot { width:9px; height:9px; border-radius:2px; flex:0 0 auto; }
  .legend b { color:var(--text); margin-left:auto; font-variant-numeric:tabular-nums; }
  .stats { display:flex; flex-direction:column; justify-content:center; gap:9px; }
  .stat { display:flex; align-items:center; gap:13px; text-decoration:none; color:inherit; padding:9px 11px; border-radius:9px; border:1px solid var(--border); background:var(--panel2); transition:border-color .15s; }
  .stat:hover { border-color:var(--accent); }
  .stat .num { font-size:26px; font-weight:700; line-height:1; min-width:36px; text-align:center; font-variant-numeric:tabular-nums; }
  .stat .lab { font-size:13.5px; } .stat .lab small { display:block; color:var(--muted); font-size:11.5px; }
  .stat.bug .num { color:var(--danger); } .stat.vuln .num { color:var(--warn); } .stat.arb .num { color:var(--accent); }
  .stat.zero .num { color:var(--ok); }
  /* Timeline des EPICs */
  .epic-timeline { list-style:none; margin:0; padding:6px 0 2px; display:flex; gap:0; overflow-x:auto; }
  .epic-timeline li { position:relative; flex:1 1 0; min-width:128px; padding:0 8px; }
  .epic-timeline li:not(:last-child):after { content:""; position:absolute; top:13px; left:calc(50% + 16px); right:calc(-50% + 16px); height:2px; background:var(--border); }
  .epic-timeline li.done:not(:last-child):after { background:var(--ok); }
  .epic-timeline .node { position:relative; z-index:1; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; margin:0 auto 9px; background:var(--panel2); border:2px solid var(--border); color:var(--muted); }
  .epic-timeline li.done .node { background:var(--ok); border-color:var(--ok); color:#06240a; }
  .epic-timeline li.current .node { border-color:var(--accent); color:var(--accent); box-shadow:0 0 0 4px rgba(110,168,254,.18); }
  .epic-timeline .ep-id { font-family:ui-monospace,monospace; font-size:11px; color:var(--muted); text-align:center; display:block; }
  .epic-timeline .ep-title { font-size:12.5px; text-align:center; display:block; line-height:1.35; }
  .epic-timeline li.current .ep-title { color:var(--accent); font-weight:600; }
  .epic-timeline li.todo { opacity:.65; }
  /* EPIC en cours : tâches faites / en cours / à venir */
  .cur-epic-h { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
  .cur-epic-h .eid { font-family:ui-monospace,monospace; color:var(--accent); }
  .cur-epic-h .pill { font-size:12px; color:var(--muted); background:var(--panel2); border:1px solid var(--border); border-radius:999px; padding:2px 9px; margin-left:auto; }
  .taskcols { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  @media (max-width:680px){ .taskcols{ grid-template-columns:1fr; } }
  .taskcol h4 { margin:0 0 8px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); display:flex; justify-content:space-between; }
  .taskcol.done h4 { color:var(--ok); } .taskcol.cur h4 { color:var(--accent); }
  .taskcol ul { list-style:none; margin:0; padding:0; }
  .taskcol li { background:var(--panel2); border:1px solid var(--border); border-left:3px solid var(--cc); border-radius:6px; padding:6px 8px; margin-bottom:6px; font-size:13px; }
  .taskcol li .tid { display:block; color:var(--muted); font-size:11px; font-family:ui-monospace,monospace; }
  .taskcol .empty { color:var(--muted); font-style:italic; font-size:12.5px; }
  .md table { border-collapse:collapse; width:100%; margin:12px 0; font-size:14px; display:block; overflow-x:auto; }
  .md th, .md td { border:1px solid var(--border); padding:6px 10px; text-align:left; vertical-align:top; }
  .md th { background:var(--panel2); }
  .md code { background:var(--panel2); padding:1px 5px; border-radius:4px; font-size:13px; }
  .md pre { background:var(--panel2); padding:12px; border-radius:8px; overflow:auto; }
  .md h1 { display:none; } .md h2, .md h3 { margin-top:18px; }
  .mermaid { background:#fff; border-radius:8px; padding:12px; margin:12px 0; }
  /* clickable affordances */
  .legend li.clickable { cursor:pointer; border-radius:6px; padding:3px 5px; margin:0 -5px; }
  .legend li.clickable:hover { background:var(--panel2); color:var(--text); }
  .legend li.clickable:hover b { color:var(--accent); }
  .epic-timeline li.clickable { cursor:pointer; }
  .epic-timeline li.clickable:hover .ep-title { color:var(--accent); }
  .epic-timeline li.clickable:hover .node { border-color:var(--accent); }
  .stat { cursor:pointer; }
  header .featbtn { margin-left:auto; background:var(--accent); border:1px solid var(--accent); color:#0b1220; font-weight:600; border-radius:999px; padding:6px 15px; font-size:13px; cursor:pointer; white-space:nowrap; }
  header .featbtn:hover { filter:brightness(1.08); }
  /* modal */
  .modal[hidden]{ display:none; }
  .modal{ position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; padding:24px; }
  .modal .backdrop{ position:absolute; inset:0; background:rgba(4,6,10,.64); }
  .modal .box{ position:relative; background:var(--panel); border:1px solid var(--border); border-radius:14px; width:min(880px,100%); max-height:86vh; display:flex; flex-direction:column; box-shadow:0 24px 64px rgba(0,0,0,.55); }
  .modal .mhead{ display:flex; align-items:baseline; gap:12px; padding:15px 20px; border-bottom:1px solid var(--border); }
  .modal .mhead h3{ margin:0; font-size:16px; }
  .modal .mhead .mcount{ color:var(--muted); font-size:13px; }
  .modal .mclose{ margin-left:auto; background:none; border:none; color:var(--muted); font-size:18px; cursor:pointer; line-height:1; padding:3px 8px; border-radius:6px; align-self:center; }
  .modal .mclose:hover{ background:var(--panel2); color:var(--text); }
  .modal .mbody{ padding:16px 20px 20px; overflow:auto; }
  .modal-table{ border-collapse:collapse; width:100%; font-size:13.5px; }
  .modal-table th,.modal-table td{ border-bottom:1px solid var(--border); padding:8px 11px; text-align:left; vertical-align:top; }
  .modal-table th{ color:var(--muted); font-weight:600; font-size:11.5px; text-transform:uppercase; letter-spacing:.04em; }
  .modal-table tbody tr:hover{ background:var(--panel2); }
  .mono{ font-family:ui-monospace,monospace; font-size:12px; color:var(--accent); white-space:nowrap; }
  .badge-st{ display:inline-block; padding:2px 9px; border-radius:999px; font-size:11.5px; font-weight:600; white-space:nowrap; }
  .modal-empty{ color:var(--muted); font-style:italic; }
  .modal h4.mgrp{ margin:20px 0 9px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--accent); }
  .modal h4.mgrp:first-child{ margin-top:2px; }
  .inc{ border:1px solid var(--border); border-radius:9px; padding:10px 13px; margin-bottom:9px; background:var(--panel2); }
  .inc .inc-h{ font-weight:600; margin-bottom:5px; } .inc .inc-h .mono{ margin-right:9px; }
  .inc ul{ margin:5px 0 0; padding-left:18px; color:var(--muted); font-size:12.5px; } .inc li{ margin:1px 0; }
</style>
</head>
<body>
<header>
  <h1>AI-Led — Dashboard</h1>
  <span class="gen">generated on __GENERATED__ · read-only</span>
  <button id="featBtn" class="featbtn" type="button">Feature list</button>
  <div class="badges" id="badges"></div>
</header>
<main>
  <div id="synth"></div>
  <button id="toggleDetail" class="toggle" type="button" aria-expanded="false">▸ Memory detail (raw files)</button>
  <div id="detailWrap" hidden>
    <div id="toc" class="toc"></div>
    <div id="detail"></div>
  </div>
</main>
<div id="modal" class="modal" hidden>
  <div class="backdrop" data-close="1"></div>
  <div class="box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="mhead"><h3 id="modalTitle"></h3><span id="modalCount" class="mcount"></span><button id="modalClose" class="mclose" type="button" aria-label="Close">✕</button></div>
    <div id="modalBody" class="mbody"></div>
  </div>
</div>
<script>
  var DATA = /*__DATA__*/;
  var STYLE = "__STYLE__";
  var STATUSES = ['TO_CHECK','TODO','IN_PROGRESS','TO_TEST','DONE'];
  var LABEL = {TO_CHECK:'To check',TODO:'To do',IN_PROGRESS:'In progress',TO_TEST:'To test',DONE:'Done'};
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
      var st=normStatus(cs[map.status]);
      if(!st) return;
      cols[st].push({ id:map.id>=0?cs[map.id]:'', title:map.title>=0?cs[map.title]:'' });
    });
    return cols;
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
  var SCOL={TO_CHECK:'#c08be8',TODO:'#8b929e',IN_PROGRESS:'#6ea8fe',TO_TEST:'#f0c674',DONE:'#6cc070'};
  // donut à partir de segments [{value,color}] ; center = {big,small} affiché dans le trou
  function pieSvg(segs, center){
    center = center || {};
    var tot=segs.reduce(function(n,s){ return n+s.value; },0);
    var hole='<circle cx="64" cy="64" r="34" fill="var(--panel)"/>';
    var ctr = center.big ? '<text x="64" y="61" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="700">'+esc(center.big)+'</text>'
      + (center.small?'<text x="64" y="80" text-anchor="middle" fill="var(--muted)" font-size="10.5">'+esc(center.small)+'</text>':'') : '';
    if(!tot) return '<svg width="132" height="132" viewBox="0 0 132 132"><g transform="translate(2,2)"><circle cx="64" cy="64" r="56" fill="none" stroke="var(--panel2)" stroke-width="16"/><text x="64" y="69" text-anchor="middle" fill="var(--muted)" font-size="12">aucun</text></g></svg>';
    var cx=64, cy=64, r=56, a=-Math.PI/2, parts='';
    segs.forEach(function(s){
      if(!s.value) return;
      var frac=s.value/tot, a2=a+frac*2*Math.PI;
      if(frac>=0.99999){ parts+='<circle cx="64" cy="64" r="'+r+'" fill="'+s.color+'"/>'; a=a2; return; }
      var x1=cx+r*Math.cos(a), y1=cy+r*Math.sin(a), x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
      parts+='<path d="M'+cx+' '+cy+' L'+x1.toFixed(2)+' '+y1.toFixed(2)+' A'+r+' '+r+' 0 '+(frac>0.5?1:0)+' 1 '+x2.toFixed(2)+' '+y2.toFixed(2)+' Z" fill="'+s.color+'"/>';
      a=a2;
    });
    return '<svg width="132" height="132" viewBox="0 0 132 132"><g transform="translate(2,2)">'+parts+hole+'<circle cx="64" cy="64" r="56" fill="none" stroke="var(--border)"/>'+ctr+'</g></svg>';
  }
  function classifyEpic(s){
    var v=(s||'').toUpperCase();
    if(/DONE|TERMIN|LIVR|CLOS/.test(v)) return 'done';
    if(/IN[_ ]?PROGRESS|EN COURS|WIP|DOING/.test(v)) return 'current';
    return 'todo';
  }
  // canonical status, tolerant to backticks / case / accents / FR-EN wording
  function normStatus(raw){
    var v=String(raw||'').replace(/\`/g,'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toUpperCase().replace(/[\\s-]+/g,'_');
    if(!v) return null;
    if(STATUSES.indexOf(v)>=0) return v;
    if(/^(IN_?PROGRESS|EN_?COURS|WIP|DOING|ONGOING)$/.test(v)) return 'IN_PROGRESS';
    if(/^(DONE|TERMINE|LIVRE|CLOS|CLOSED|FERME|MERGED?)$/.test(v)) return 'DONE';
    if(/^(TO_?TEST|A_?TESTER|TESTING|TEST|IN_?TEST)$/.test(v)) return 'TO_TEST';
    if(/^(TO_?CHECK|A_?VERIFIER|CK|TO_?CLARIFY)$/.test(v)) return 'TO_CHECK';
    if(/^(TODO|A_?FAIRE|BACKLOG|OPEN|NEW)$/.test(v)) return 'TODO';
    return null;
  }
  // epics.md → [{id,title,status}] dans l'ordre de déclaration
  function parseEpics(md){
    var out=[]; if(!md) return out; var map=null;
    md.split('\\n').forEach(function(line){
      if(line.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(line), lo=cs.map(function(c){ return c.toLowerCase(); });
      var ei=lo.indexOf('epic');
      if(ei>=0 && (lo.indexOf('titre')>=0||lo.indexOf('title')>=0)){
        map={ epic:ei, title:lo.indexOf('titre')>=0?lo.indexOf('titre'):lo.indexOf('title'), status:lo.indexOf('statut')>=0?lo.indexOf('statut'):lo.indexOf('status') };
        return;
      }
      if(isSep(line)||!map) return;
      var id=(cs[map.epic]||'').replace(/\`/g,'').trim();
      if(!id||id==='—') return;
      out.push({ id:id, title:(map.title>=0?cs[map.title]:'')||'', status:classifyEpic(map.status>=0?cs[map.status]:'') });
    });
    return out;
  }
  // kanban.md → [{id,title,status,epic}]
  function parseKanbanFull(md){
    var out=[]; if(!md) return out; var map=null;
    md.split('\\n').forEach(function(line){
      if(line.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(line), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.indexOf('status')>=0 && (lo.indexOf('titre')>=0||lo.indexOf('title')>=0)){
        map={ status:lo.indexOf('status'), title:lo.indexOf('titre')>=0?lo.indexOf('titre'):lo.indexOf('title'), id:lo.indexOf('id'), epic:lo.indexOf('epic') };
        return;
      }
      if(isSep(line)||!map) return;
      var st=normStatus(cs[map.status]);
      if(!st) return;
      out.push({ id:map.id>=0?cs[map.id]:'', title:map.title>=0?cs[map.title]:'', status:st, epic:map.epic>=0?(cs[map.epic]||'').replace(/\`/g,'').trim().toUpperCase():'' });
    });
    return out;
  }
  // statut effectif d'une epic : dérivé de ses tickets, sinon valeur du fichier
  function epicEff(epic, tickets){
    var ts=tickets.filter(function(t){ return t.epic && t.epic===epic.id.toUpperCase(); });
    if(ts.length){
      if(ts.some(function(t){ return t.status==='IN_PROGRESS'; })) return 'current';
      if(ts.every(function(t){ return t.status==='DONE'; })) return 'done';
      return 'todo';
    }
    return epic.status||'todo';
  }
  // jalons + colonne EPICs, pour estimer l'avancement du jalon en cours
  function parseMilestonesFull(md){
    var out=[]; if(!md) return out; var map=null;
    md.split('\\n').forEach(function(line){
      if(line.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(line), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.some(function(c){return /jalon|milestone/.test(c);}) && lo.some(function(c){return /livraison|delivery/.test(c);})){
        map={ name:lo.findIndex(function(c){return /jalon|milestone/.test(c);}), target:lo.findIndex(function(c){return /cible|target/.test(c);}), deliv:lo.findIndex(function(c){return /livraison|delivery/.test(c);}), epics:lo.findIndex(function(c){return /epic/.test(c);}) };
        return;
      }
      if(isSep(line)||!map) return;
      var raw=map.name>=0?cs[map.name]:''; var name=raw.replace(/~~/g,'').trim();
      if(!name||name==='—') return;
      var d=map.deliv>=0?cs[map.deliv]:'';
      var ec=map.epics>=0?cs[map.epics]:'';
      out.push({ name:name, target:map.target>=0?cs[map.target]:'', delivered:(!!d && d!=='—')||/~~/.test(raw), epics:(ec.match(/EPIC-?\\d+/gi)||[]).map(function(s){ return s.toUpperCase(); }) });
    });
    return out;
  }
  function milestoneProgress(roadmapMd, epics, tickets){
    var miles=parseMilestonesFull(roadmapMd);
    var cur=miles.filter(function(m){ return !m.delivered; })[0] || miles[miles.length-1];
    if(!cur) return null;
    var done=0, total=0;
    if(cur.epics.length){
      var tk=tickets.filter(function(t){ return t.epic && cur.epics.indexOf(t.epic)>=0; });
      if(tk.length){ total=tk.length; done=tk.filter(function(t){ return t.status==='DONE'; }).length; }
      else {
        var eps=epics.filter(function(e){ return cur.epics.indexOf(e.id.toUpperCase())>=0; });
        total=eps.length; done=eps.filter(function(e){ return epicEff(e,tickets)==='done'; }).length;
      }
    }
    return { name:cur.name, target:cur.target, done:done, total:total, pct:total?Math.round(done/total*100):0 };
  }
  // bugs à traiter : entrées INC- actives du registre incidents.md
  function countIncidents(md){
    if(!md) return 0; var inReg=false, n=0;
    md.split('\\n').forEach(function(l){
      if(/^##\\s/.test(l)){ inReg=/registre des incidents|incident registry/i.test(l); return; }
      if(inReg && /^###\\s+INC-/i.test(l)) n++;
    });
    return n;
  }
  // vulnérabilités ouvertes du tableau security.md
  function countVulns(md){
    var res={open:0,crit:0}; if(!md) return res; var inSec=false, map=null;
    md.split('\\n').forEach(function(l){
      if(/^##\\s/.test(l)){ inSec=/vulnérabilit|vulnerabilit/i.test(l); map=null; return; }
      if(!inSec) return;
      if(l.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(l), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.indexOf('id')>=0 && lo.some(function(c){ return /sévérité|severit/.test(c); })){
        map={ sev:lo.findIndex(function(c){ return /sévérité|severit/.test(c); }), stat:lo.findIndex(function(c){ return /statut|status/.test(c); }) };
        return;
      }
      if(isSep(l)||!map) return;
      var stat=(map.stat>=0?cs[map.stat]:'').toLowerCase().trim();
      if(!stat || /corrig|résolu|resolved|fixed|clos|closed|accept|^n\\.?a|^—$/.test(stat)) return;
      res.open++;
      if(/CRITICAL|HIGH/.test((map.sev>=0?cs[map.sev]:'').toUpperCase())) res.crit++;
    });
    return res;
  }
  // sujets en attente d'arbitrage produit (discovery → roadmap)
  function countCandidates(md){
    if(!md) return 0; var inSec=false, map=null, n=0;
    md.split('\\n').forEach(function(l){
      if(/^##\\s/.test(l)){ inSec=/sujets candidats|candidate topics/i.test(l); map=null; return; }
      if(!inSec) return;
      if(l.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(l), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.indexOf('id')>=0 && lo.some(function(c){ return /statut|status/.test(c); })){
        map={ stat:lo.findIndex(function(c){ return /statut|status/.test(c); }) };
        return;
      }
      if(isSep(l)||!map) return;
      if(/^candidat/.test((map.stat>=0?cs[map.stat]:'').toLowerCase().trim())) n++;
    });
    return n;
  }

  // ── Modal (popups) ────────────────────────────────────────
  var modalEl=null;
  function openModal(title, count, html){
    if(!modalEl) modalEl=document.getElementById('modal');
    document.getElementById('modalTitle').textContent=title;
    document.getElementById('modalCount').textContent=count||'';
    document.getElementById('modalBody').innerHTML=html||'';
    modalEl.hidden=false;
  }
  function closeModal(){ if(modalEl) modalEl.hidden=true; }
  // colored status pill
  function badge(st){ var col=SCOL[st]||'#8b929e'; return '<span class="badge-st" style="background:'+col+'22;color:'+col+';border:1px solid '+col+'66">'+(LABEL[st]||st)+'</span>'; }
  // table of tickets (id / title / [epic] / status)
  function taskTable(list, withEpic){
    if(!list.length) return '<p class="modal-empty">No matching task.</p>';
    return '<table class="modal-table"><thead><tr><th>ID</th><th>Title</th>'+(withEpic?'<th>EPIC</th>':'')+'<th>Status</th></tr></thead><tbody>'
      + list.map(function(t){ return '<tr><td class="mono">'+esc(t.id||'—')+'</td><td>'+esc(t.title||'(untitled)')+'</td>'
          +(withEpic?'<td class="mono">'+esc(t.epic||'—')+'</td>':'')+'<td>'+badge(t.status)+'</td></tr>'; }).join('')
      + '</tbody></table>';
  }
  // registre incidents → [{id,title,fields[]}]
  function listIncidents(md){
    var out=[]; if(!md) return out; var inReg=false, cur=null;
    md.split('\\n').forEach(function(l){
      if(/^##\\s/.test(l)){ if(cur){out.push(cur);cur=null;} inReg=/registre des incidents|incident registry/i.test(l); return; }
      if(!inReg) return;
      var m=l.match(/^###\\s+(INC-\\S+)\\s*[—-]?\\s*(.*)$/i);
      if(m){ if(cur) out.push(cur); cur={id:m[1],title:(m[2]||'').trim(),fields:[]}; return; }
      if(cur){ var t=l.trim(); if(/^[-*]\\s+/.test(t)) cur.fields.push(t.replace(/^[-*]\\s+/,'')); }
    });
    if(cur) out.push(cur);
    return out;
  }
  // table sécurité → vulnérabilités ouvertes [{id,sev,comp,risk,status}]
  function listVulns(md){
    var out=[]; if(!md) return out; var inSec=false, map=null;
    md.split('\\n').forEach(function(l){
      if(/^##\\s/.test(l)){ inSec=/vulnérabilit|vulnerabilit/i.test(l); map=null; return; }
      if(!inSec || l.trim().charAt(0)!=='|') { if(l.trim().charAt(0)!=='|') map=null; return; }
      var cs=cells(l), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.indexOf('id')>=0 && lo.some(function(c){ return /sévérité|severit/.test(c); })){
        map={ id:lo.indexOf('id'), sev:lo.findIndex(function(c){return /sévérité|severit/.test(c);}), comp:lo.findIndex(function(c){return /composant|component/.test(c);}), risk:lo.findIndex(function(c){return /risque|risk/.test(c);}), stat:lo.findIndex(function(c){return /statut|status/.test(c);}) };
        return;
      }
      if(isSep(l)||!map) return;
      var status=(map.stat>=0?cs[map.stat]:'').toLowerCase().trim();
      if(!status || /corrig|résolu|resolved|fixed|clos|closed|accept|^n\\.?a|^—$/.test(status)) return;
      out.push({ id:map.id>=0?cs[map.id]:'', sev:map.sev>=0?cs[map.sev]:'', comp:map.comp>=0?cs[map.comp]:'', risk:map.risk>=0?cs[map.risk]:'', status:map.stat>=0?cs[map.stat]:'' });
    });
    return out;
  }
  function sevBadge(s){ var u=(s||'').toUpperCase(); var col=/CRITICAL|HIGH/.test(u)?'var(--danger)':/MEDIUM/.test(u)?'var(--warn)':'var(--muted)'; return '<span class="badge-st" style="color:'+col+';border:1px solid '+col+'">'+esc(s||'—')+'</span>'; }
  // backlog veille → sujets candidats [{id,topic,hyp,impact,effort}]
  function listCandidates(md){
    var out=[]; if(!md) return out; var inSec=false, map=null;
    md.split('\\n').forEach(function(l){
      if(/^##\\s/.test(l)){ inSec=/sujets candidats|candidate topics/i.test(l); map=null; return; }
      if(!inSec || l.trim().charAt(0)!=='|'){ if(l.trim().charAt(0)!=='|') map=null; return; }
      var cs=cells(l), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.indexOf('id')>=0 && lo.some(function(c){ return /statut|status/.test(c); })){
        map={ id:lo.indexOf('id'), topic:lo.findIndex(function(c){return /sujet|topic/.test(c);}), hyp:lo.findIndex(function(c){return /hypoth/.test(c);}), impact:lo.findIndex(function(c){return /impact/.test(c);}), effort:lo.findIndex(function(c){return /effort/.test(c);}), stat:lo.findIndex(function(c){return /statut|status/.test(c);}) };
        return;
      }
      if(isSep(l)||!map) return;
      if(!/^candidat/.test((map.stat>=0?cs[map.stat]:'').toLowerCase().trim())) return;
      out.push({ id:map.id>=0?cs[map.id]:'', topic:map.topic>=0?cs[map.topic]:'', hyp:map.hyp>=0?cs[map.hyp]:'', impact:map.impact>=0?cs[map.impact]:'', effort:map.effort>=0?cs[map.effort]:'' });
    });
    return out;
  }
  // render every "## heading + markdown table" of a file as grouped HTML tables (offline-safe)
  function sectionsWithTables(md){
    if(!md) return '';
    var html='', cur=null, head=null, rows=[];
    function flush(){
      if(cur && head && rows.length){
        html+='<h4 class="mgrp">'+esc(cur)+'</h4><table class="modal-table"><thead><tr>'
          + head.map(function(h){ return '<th>'+esc(h)+'</th>'; }).join('')+'</tr></thead><tbody>'
          + rows.map(function(r){ return '<tr>'+r.map(function(c,i){ return '<td'+(i===0?' class="mono"':'')+'>'+esc(c)+'</td>'; }).join('')+'</tr>'; }).join('')
          + '</tbody></table>';
      }
      head=null; rows=[];
    }
    md.split('\\n').forEach(function(l){
      var h=l.match(/^##\\s+(.*)$/);
      if(h){ flush(); cur=h[1].trim(); return; }
      if(/^#\\s/.test(l)) return;
      if(l.trim().charAt(0)==='|'){ if(isSep(l)) return; var cs=cells(l); if(!head) head=cs; else rows.push(cs); }
    });
    flush();
    return html;
  }
  // popup openers
  function openStatus(st){ var l=tickets.filter(function(t){ return t.status===st; }); openModal(LABEL[st]+' — tasks', l.length+' ticket'+(l.length===1?'':'s'), taskTable(l,true)); }
  function openEpic(id){
    var up=(id||'').toUpperCase(); var l=tickets.filter(function(t){ return t.epic===up; });
    var ep=epics.filter(function(e){ return e.id.toUpperCase()===up; })[0];
    openModal((ep&&ep.title? id+' — '+ep.title : id), l.length+' task'+(l.length===1?'':'s'), taskTable(l,false));
  }
  function openIncidents(){
    var l=listIncidents((get('incidents')||{}).content);
    var b=l.length? l.map(function(i){ return '<div class="inc"><div class="inc-h"><span class="mono">'+esc(i.id)+'</span>'+esc(i.title)+'</div>'
      +(i.fields.length?'<ul>'+i.fields.map(function(f){ return '<li>'+esc(f)+'</li>'; }).join('')+'</ul>':'')+'</div>'; }).join('')
      : '<p class="modal-empty">No open incident.</p>';
    openModal('Bugs to handle', l.length+' incident'+(l.length===1?'':'s'), b);
  }
  function openVulns(){
    var l=listVulns((get('security')||{}).content);
    var b=l.length? '<table class="modal-table"><thead><tr><th>ID</th><th>Severity</th><th>Component</th><th>Real risk</th><th>Status</th></tr></thead><tbody>'
      + l.map(function(v){ return '<tr><td class="mono">'+esc(v.id)+'</td><td>'+sevBadge(v.sev)+'</td><td>'+esc(v.comp||'—')+'</td><td>'+esc(v.risk||'—')+'</td><td>'+esc(v.status||'—')+'</td></tr>'; }).join('')
      + '</tbody></table>' : '<p class="modal-empty">No open vulnerability.</p>';
    openModal('Open vulnerabilities', l.length+' item'+(l.length===1?'':'s'), b);
  }
  function openCandidates(){
    var l=listCandidates((get('market-watch')||{}).content);
    var b=l.length? '<table class="modal-table"><thead><tr><th>ID</th><th>Topic</th><th>Value hypothesis</th><th>Impact</th><th>Effort</th></tr></thead><tbody>'
      + l.map(function(x){ return '<tr><td class="mono">'+esc(x.id)+'</td><td>'+esc(x.topic||'—')+'</td><td>'+esc(x.hyp||'—')+'</td><td>'+esc(x.impact||'—')+'</td><td>'+esc(x.effort||'—')+'</td></tr>'; }).join('')
      + '</tbody></table>' : '<p class="modal-empty">No pending arbitration.</p>';
    openModal('Product arbitrations', l.length+' topic'+(l.length===1?'':'s'), b);
  }
  function openFeatures(){
    openModal('Feature inventory', 'delivery / release info in the Notes column',
      sectionsWithTables((get('features')||{}).content) || '<p class="modal-empty">No feature recorded yet.</p>');
  }

  // ── En-tête / badges ──────────────────────────────────────
  var cfg=get('config'); var integ=parseIntegrations(cfg&&cfg.content);
  var badges = integ.map(function(it){
    return it.on ? '<span class="badge on">'+esc(it.area)+' <b>'+esc(it.tool)+'</b></span>'
                 : '<span class="badge off">'+esc(it.area)+'</span>';
  }).join('') + '<span class="badge style">style&nbsp;<b>'+esc(STYLE)+'</b></span>';
  document.getElementById('badges').innerHTML = badges;

  var board = parseBoard((get('kanban')||{}).content);
  var tickets = parseKanbanFull((get('kanban')||{}).content);
  var epics = parseEpics((get('epics')||{}).content);
  var total = STATUSES.reduce(function(n,s){ return n+board[s].length; },0);
  var done = board.DONE.length;
  var pct = total ? Math.round(done/total*100) : 0;
  var summary = stateSummary((get('project-state')||{}).content);

  // ── Camemberts : avancement global + jalon en cours ───────
  var globalSegs = STATUSES.slice().reverse().map(function(s){ return { value:board[s].length, color:SCOL[s], label:LABEL[s], st:s }; });
  var globalLegend = STATUSES.slice().reverse().filter(function(s){ return board[s].length; })
    .map(function(s){ return '<li class="clickable" data-st="'+s+'" title="Click to list these tasks"><span class="ldot" style="background:'+SCOL[s]+'"></span>'+LABEL[s]+'<b>'+board[s].length+'</b></li>'; }).join('');
  var globalCard =
    '<div class="card pie-card">'
    + '<div class="piefig">'+pieSvg(globalSegs,{big:pct+'%'})+'</div>'
    + '<div class="pieinfo"><h3>Overall progress</h3><div class="pie-sub">'+done+' / '+total+' tickets done</div>'
    +   '<ul class="legend">'+(globalLegend||'<li class="empty">No ticket</li>')+'</ul></div>'
    + '</div>';

  var ms = milestoneProgress((get('roadmap')||{}).content, epics, tickets);
  var msCard;
  if(ms){
    var msSegs=[{ value:ms.done, color:SCOL.DONE },{ value:Math.max(0,ms.total-ms.done), color:'var(--border)' }];
    msCard =
      '<div class="card pie-card">'
      + '<div class="piefig">'+pieSvg(msSegs,{big:ms.pct+'%',small:'≈ est.'})+'</div>'
      + '<div class="pieinfo"><h3>Current milestone</h3>'
      +   '<div class="pie-sub"><b style="color:var(--text)">'+esc(ms.name)+'</b>'+(ms.target?' · target '+esc(ms.target):'')+'</div>'
      +   '<ul class="legend"><li><span class="ldot" style="background:'+SCOL.DONE+'"></span>Covered<b>'+ms.done+'</b></li>'
      +     '<li><span class="ldot" style="background:var(--border)"></span>Remaining<b>'+Math.max(0,ms.total-ms.done)+'</b></li></ul></div>'
      + '</div>';
  } else {
    msCard = '<div class="card pie-card"><div class="pieinfo"><h3>Current milestone</h3><div class="pie-sub">No milestone defined (roadmap.md)</div></div></div>';
  }

  // ── Chiffres d'action : bugs / vulnérabilités / arbitrages ─
  var inc = countIncidents((get('incidents')||{}).content);
  var vul = countVulns((get('security')||{}).content);
  var arb = countCandidates((get('market-watch')||{}).content);
  function statTile(cls,kind,num,label,sub){
    return '<div class="stat '+cls+(num?'':' zero')+'" data-kind="'+kind+'" role="button" tabindex="0" title="Click for details">'
      + '<span class="num">'+num+'</span>'
      + '<span class="lab">'+label+'<small>'+sub+'</small></span></div>';
  }
  var statsCard =
    '<div class="card stats">'
    + statTile('bug','bugs',inc,'Bugs to handle','incident workflow')
    + statTile('vuln','vulns',vul.open,'Vulnerabilities',(vul.crit?vul.crit+' critical/high · ':'')+'security workflow')
    + statTile('arb','arb',arb,'Product arbitrations','discovery → roadmap')
    + '</div>';

  // ── Timeline des EPICs ────────────────────────────────────
  var epList = epics.length ? epics : (function(){
    var seen=[]; tickets.forEach(function(t){ if(t.epic && !seen.find(function(e){return e.id===t.epic;})) seen.push({ id:t.epic, title:'', status:'todo' }); }); return seen;
  })();
  var epEff = epList.map(function(e){ var o={ id:e.id, title:e.title, eff:epicEff(e,tickets) }; return o; });
  var timelineHtml = epEff.length ? epEff.map(function(e){
    var g=e.eff==='done'?'✓':(e.eff==='current'?'▶':'·');
    return '<li class="'+e.eff+' clickable" data-epic="'+esc(e.id)+'" title="Click to list this EPIC\\'s tasks"><span class="node">'+g+'</span><span class="ep-id">'+esc(e.id)+'</span><span class="ep-title">'+esc(e.title||'')+'</span></li>';
  }).join('') : '<li class="todo"><span class="node">·</span><span class="ep-title">No EPIC defined</span></li>';

  // ── EPIC en cours : tâches faites / en cours / à venir ────
  var ci=epEff.findIndex(function(e){ return e.eff==='current'; });
  if(ci<0) ci=epEff.findIndex(function(e){ return e.eff!=='done'; });
  if(ci<0) ci=epEff.length-1;
  var curEpic=epEff[ci];
  var curEpicHtml='';
  if(curEpic){
    var linked=tickets.filter(function(t){ return curEpic.id && t.epic===curEpic.id.toUpperCase(); });
    var pool=linked.length?linked:(epics.length?[]:tickets);
    var doneT=pool.filter(function(t){ return t.status==='DONE'; });
    var curT=pool.filter(function(t){ return t.status==='IN_PROGRESS'; });
    var nextT=pool.filter(function(t){ return t.status!=='DONE' && t.status!=='IN_PROGRESS'; });
    function tcol(cls,label,arr,col){
      var items=arr.length?arr.map(function(t){
        return '<li style="--cc:'+col+'">'+(t.id?'<span class="tid">'+esc(t.id)+'</span>':'')+esc(t.title||'(untitled)')+'</li>';
      }).join(''):'<div class="empty">—</div>';
      return '<div class="taskcol '+cls+'"><h4><span>'+label+'</span><span>'+arr.length+'</span></h4><ul>'+items+'</ul></div>';
    }
    curEpicHtml =
      '<div class="card"><div class="cur-epic-h"><strong><span class="eid">'+esc(curEpic.id)+'</span> '+esc(curEpic.title||'')+'</strong>'
      + '<span class="pill">'+doneT.length+'/'+pool.length+' tasks done</span></div>'
      + '<div class="taskcols">'
      +   tcol('done','Done',doneT,SCOL.DONE)
      +   tcol('cur','In progress',curT,SCOL.IN_PROGRESS)
      +   tcol('next','Upcoming',nextT,SCOL.TODO)
      + '</div></div>';
  } else {
    curEpicHtml = '<div class="card"><div class="empty">No EPIC in progress.</div></div>';
  }

  // ── Watch-out list ────────────────────────────────────────
  var watch=[];
  DATA.forEach(function(e){ if(e.age!==null && e.age>staleLimit(e.name)) watch.push(esc(e.file)+' — '+e.age+' days without update'); });
  var off = integ.filter(function(it){ return !it.on; }).map(function(it){ return esc(it.area); });
  if(off.length) watch.push('Disabled integrations: '+off.join(', '));
  if(board.TO_CHECK.length) watch.push(board.TO_CHECK.length+' pending TO_CHECK clarification(s)');
  var watchHtml = watch.length ? watch.map(function(w){ return '<li>'+w+'</li>'; }).join('') : '<li class="empty">Nothing to report</li>';

  document.getElementById('synth').innerHTML =
    '<h2 class="sec">Overview</h2>'
    + (summary?'<p class="lede">'+esc(summary)+'</p>':'')
    + '<div class="kpis">'+globalCard+msCard+statsCard+'</div>'
    + '<h2 class="sec">EPIC timeline</h2>'
    + '<div class="card"><ol class="epic-timeline">'+timelineHtml+'</ol></div>'
    + '<h2 class="sec">Current EPIC</h2>'
    + curEpicHtml
    + '<h2 class="sec">Watch out</h2>'
    + '<div class="card"><ul class="watch">'+watchHtml+'</ul></div>';

  // ── Détail (replié) ───────────────────────────────────────
  var open = STYLE==='detailed' ? ' open' : '';
  var toc='', det='';
  DATA.forEach(function(e){
    var stale=(e.age!==null && e.age>staleLimit(e.name));
    toc += '<a href="#f-'+e.name+'" data-t="f-'+e.name+'">'+esc(e.title)+(stale?' <span class="dot">●</span>':'')+'</a>';
    var stamp = e.date ? ('upd '+e.date+(e.age!==null?(' · '+e.age+' d'+(stale?' — stale':'')):'')) : 'date unknown';
    det += '<details class="file" id="f-'+e.name+'"'+open+'><summary><span class="sf">'+esc(e.file)+'</span> '+esc(e.title)+'<span class="st">'+stamp+'</span></summary><div class="md">'+marked.parse(e.content)+'</div></details>';
  });
  document.getElementById('toc').innerHTML = toc;
  document.getElementById('detail').innerHTML = det;

  // bouton repliable du détail de la mémoire (déplié d'office en style détaillé)
  var detailWrap=document.getElementById('detailWrap');
  var toggleBtn=document.getElementById('toggleDetail');
  function setDetail(show){
    detailWrap.hidden=!show;
    toggleBtn.setAttribute('aria-expanded', show?'true':'false');
    toggleBtn.textContent=(show?'▾':'▸')+' Memory detail (raw files)';
  }
  setDetail(STYLE==='detailed');
  toggleBtn.addEventListener('click', function(){ setDetail(detailWrap.hidden); });

  // clic sur une puce du sommaire → ouvre l'accordéon ciblé
  document.getElementById('toc').addEventListener('click', function(ev){
    var a = ev.target.closest('a'); if(!a) return;
    var el = document.getElementById(a.getAttribute('data-t')); if(el) el.open = true;
  });

  // ── clics de la synthèse → popups (délégation sur #synth, qui persiste) ──
  document.getElementById('synth').addEventListener('click', function(ev){
    var st=ev.target.closest('li[data-st]'); if(st){ openStatus(st.getAttribute('data-st')); return; }
    var ep=ev.target.closest('li[data-epic]'); if(ep){ openEpic(ep.getAttribute('data-epic')); return; }
    var k=ev.target.closest('.stat[data-kind]');
    if(k){ var kind=k.getAttribute('data-kind'); if(kind==='bugs') openIncidents(); else if(kind==='vulns') openVulns(); else openCandidates(); }
  });
  // bouton Feature list (en-tête)
  document.getElementById('featBtn').addEventListener('click', openFeatures);
  // fermeture du modal : croix, fond, Échap
  document.getElementById('modal').addEventListener('click', function(ev){
    if(ev.target.getAttribute('data-close') || ev.target.closest('#modalClose')) closeModal();
  });
  document.addEventListener('keydown', function(ev){ if(ev.key==='Escape') closeModal(); });

  document.querySelectorAll('code.language-mermaid').forEach(function(code){
    var div = document.createElement('div'); div.className='mermaid'; div.textContent = code.textContent;
    (code.closest('pre')||code).replaceWith(div);
  });
  if (window.mermaid){ mermaid.initialize({startOnLoad:false, theme:'default'}); mermaid.run({querySelector:'.mermaid'}); }
</script>
</body>
</html>`;

// ── progress sidebar (watch / dashboard) ─────────────────────
// Linear agent chains per workflow (see memory/process.md). Used to project the
// agents that "will work" after the current/last one.
const WORKFLOW_CHAINS = {
  discovery: ["ailed-scout", "ailed-seo-aso", "ailed-monetization", "ailed-fact-check", "ailed-analyst", "ailed-brainstorm"],
  feature: ["ailed-brainstorm", "ailed-ux", "ailed-pm", "ailed-architect", "ailed-planner", "ailed-dev", "ailed-review", "ailed-test", "ailed-communication", "ailed-release"],
  incident: ["ailed-check-log", "ailed-rca", "ailed-dev", "ailed-review", "ailed-test", "ailed-communication"],
  security: ["ailed-check-secu", "ailed-security-review", "ailed-dev", "ailed-review", "ailed-test", "ailed-communication"],
};

function safeRead(p) {
  try { return fs.readFileSync(p, "utf8"); } catch (_) { return ""; }
}

function classifyEpicStatus(s) {
  const v = (s || "").toUpperCase();
  if (/DONE|TERMIN|LIVR|CLOS/.test(v)) return "done";
  if (/IN[_ ]?PROGRESS|EN COURS|WIP|DOING/.test(v)) return "current";
  return "todo";
}

// parse memory/epics.md overview table → [{id,title,status}] in declaration order
function parseEpics(content) {
  const out = [];
  if (!content) return out;
  let map = null;
  for (const line of content.split("\n")) {
    if (line.trim().charAt(0) !== "|") { map = null; continue; }
    const cs = tableCells(line);
    const lo = cs.map((c) => c.toLowerCase());
    const epicIdx = lo.indexOf("epic");
    if (epicIdx >= 0 && (lo.indexOf("title") >= 0 || lo.indexOf("titre") >= 0)) {
      map = {
        epic: epicIdx,
        title: lo.indexOf("title") >= 0 ? lo.indexOf("title") : lo.indexOf("titre"),
        status: lo.indexOf("status") >= 0 ? lo.indexOf("status") : lo.indexOf("statut"),
      };
      continue;
    }
    if (isSeparatorRow(line) || !map) continue;
    const id = (cs[map.epic] || "").replace(/`/g, "").trim().toUpperCase();
    if (!id || /^—$/.test(id)) continue;
    out.push({
      id,
      title: (map.title >= 0 ? cs[map.title] : "") || "",
      status: classifyEpicStatus(map.status >= 0 ? cs[map.status] : ""),
    });
  }
  return out;
}

// parse memory/kanban.md → [{id,title,status,epic}] keeping the EPIC link
function parseKanbanFull(content) {
  const out = [];
  if (!content) return out;
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
        epic: lo.indexOf("epic"),
      };
      continue;
    }
    if (isSeparatorRow(line) || !map) continue;
    const st = normStatus(cs[map.status]);
    if (!st) continue;
    out.push({
      id: map.id >= 0 ? cs[map.id] : "",
      title: map.title >= 0 ? cs[map.title] : "",
      status: st,
      epic: map.epic >= 0 ? (cs[map.epic] || "").replace(/`/g, "").trim().toUpperCase() : "",
    });
  }
  return out;
}

function readRuntime(projectDir) {
  try {
    const p = path.join(projectDir, ".ailed", "runtime.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) { return null; }
}

// effective epic status: derived from its tickets, falling back to the file value
function epicEffStatus(epic, tickets) {
  const ts = tickets.filter((t) => t.epic && t.epic === epic.id);
  if (ts.length) {
    if (ts.some((t) => t.status === "IN_PROGRESS")) return "current";
    if (ts.every((t) => t.status === "DONE")) return "done";
    return "todo";
  }
  return epic.status || "todo";
}

// compact elapsed since an ISO timestamp: "45s", "2m14s", "1h03m"
function fmtElapsed(sinceISO) {
  if (!sinceISO) return "";
  const t = Date.parse(sinceISO);
  if (isNaN(t)) return "";
  let s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (h) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

// build the vertical progress tree as an array of ready-to-print colored lines
function buildSidebar(epics, tickets, rt, width) {
  const L = [];
  const w = Math.max(16, width);
  const cur = (s) => `\x1b[1;94m${s}\x1b[0m`; // bold bright-blue = active (matches the HTML dashboard accent)
  const short = (a) => "@" + String(a || "").replace(/^ailed-/, "");
  const clip = (s) => (s.length > w ? s.slice(0, Math.max(1, w - 1)) + "…" : s);
  const row = (indent, glyph, text, paint) => {
    const plain = " ".repeat(indent) + (glyph ? glyph + " " : "") + text;
    L.push(paint ? paint(clip(plain)) : clip(plain));
  };
  const G = { done: "✓", current: "▶", todo: "·" };
  const paintOf = { done: c.green, current: cur, todo: c.dim };
  const epLabel = (e) => `${e.id}${e.title ? "  " + e.title : ""}`;
  const tkLabel = (t) => `${t.id ? t.id + " " : ""}${t.title || ""}`.trim() || "(sans titre)";
  // compact filled/empty bar of a given length
  const bar = (pct, len) => {
    const f = Math.round((Math.max(0, Math.min(100, pct)) / 100) * len);
    return "█".repeat(f) + "░".repeat(Math.max(0, len - f));
  };
  // epic row with the completion % flush-right (padded on plain text, then painted)
  const epicRow = (glyph, label, pct, paint) => {
    const pctStr = pct == null ? "" : String(pct).padStart(3, " ") + "%";
    const head = glyph ? glyph + " " : "";
    const budget = Math.max(1, w - head.length - (pctStr ? pctStr.length + 1 : 0));
    const lbl = label.length > budget ? label.slice(0, Math.max(1, budget - 1)) + "…" : label;
    const gap = Math.max(1, w - head.length - lbl.length - pctStr.length);
    const plain = head + lbl + (pctStr ? " ".repeat(gap) + pctStr : "");
    L.push(paint ? paint(plain) : plain);
  };
  // completion % from a ticket set, falling back to the epic's derived status
  const pctOf = (ts, eff) => {
    if (ts.length) return Math.round((100 * ts.filter((t) => t.status === "DONE").length) / ts.length);
    return eff === "done" ? 100 : 0;
  };

  L.push(c.bold("AI-LED") + c.dim(" · progress"));
  L.push(c.dim("─".repeat(Math.min(w, 28))));

  // derive epic list (fall back to distinct epics referenced by tickets)
  let withStatus = epics.map((e) => ({ ...e, eff: epicEffStatus(e, tickets) }));
  if (!withStatus.length) {
    const seen = [];
    for (const t of tickets) {
      if (t.epic && !seen.find((e) => e.id === t.epic)) seen.push({ id: t.epic, title: "", status: "todo" });
    }
    withStatus = seen.map((e) => ({ ...e, eff: epicEffStatus(e, tickets) }));
  }

  if (!withStatus.length && !tickets.length) {
    L.push("");
    L.push(c.dim("Aucune epic ni tâche."));
    L.push(c.dim("→ @ailed-brainstorm"));
    return L;
  }

  // current epic: first in-progress, else first not-done, else last
  let ci = withStatus.findIndex((e) => e.eff === "current");
  if (ci < 0) ci = withStatus.findIndex((e) => e.eff !== "done");
  if (ci < 0) ci = withStatus.length - 1;

  // any ticket carries an EPIC link? if not, the whole board belongs to the
  // current epic (single-epic / un-tagged kanban) so its tasks still expand.
  const anyLinked = tickets.some((t) => t.epic);

  // list every epic, in declaration order, with its completion %; the current
  // one (▶, yellow) expands to show its last-done / in-progress / next tasks.
  withStatus.forEach((e, i) => {
    const isCur = i === ci;
    const linked = tickets.filter((t) => e.id && t.epic === e.id);
    const etx = isCur ? (linked.length ? linked : (anyLinked ? [] : tickets)) : linked;
    epicRow(G[e.eff], epLabel(e), pctOf(etx, e.eff), paintOf[e.eff]);
    if (!isCur) return;

    const doneTk = etx.filter((t) => t.status === "DONE");
    const lastDone = doneTk[doneTk.length - 1];
    const curTk = etx.find((t) => t.status === "IN_PROGRESS");
    const nextTk = etx.filter((t) => t.status !== "DONE" && t.status !== "IN_PROGRESS");

    if (lastDone) row(2, G.done, tkLabel(lastDone), c.green);

    if (curTk) {
      row(2, G.current, tkLabel(curTk), cur);
      renderAgents(4);
    } else {
      // agents may run without an in-progress ticket recorded yet
      if (rt && ((rt.running || []).length || (rt.history || []).length)) renderAgents(2);
    }

    for (const t of nextTk.slice(0, 4)) row(2, G.todo, tkLabel(t), c.dim);
    if (nextTk.length > 4) row(2, "", c.dim(`+${nextTk.length - 4} autres tâches`));
  });

  // footer
  const total = tickets.length;
  const done = tickets.filter((t) => t.status === "DONE").length;
  const pctAll = total ? Math.round((100 * done) / total) : 0;
  const wf = rt && rt.workflow ? rt.workflow : null;
  const running0 = rt && rt.running && rt.running[0];
  L.push("");
  // main-loop heartbeat: when no ailed-* agent is running, show the last tool the
  // main loop touched with a live chrono, so the panel still breathes during direct
  // work (Edit/Bash/Read…) instead of looking frozen.
  if (!running0 && rt && rt.lastTool && rt.lastTool.tool) {
    L.push(c.dim(`⋯ ${rt.lastTool.tool} · ${fmtElapsed(rt.lastTool.at)}`));
  }
  L.push(c.dim(`${bar(pctAll, Math.min(w - 6, 18))} ${pctAll}%`));
  L.push(c.dim(`${done}/${total} tickets DONE${wf ? " · " + wf : ""}`));
  return L;

  function renderAgents(indent) {
    const running = rt && rt.running && rt.running[0];
    const hist = (rt && rt.history) || [];
    const lastAg = hist.length ? hist[hist.length - 1] : null;
    const wfChain = WORKFLOW_CHAINS[(rt && rt.workflow) || "feature"] || WORKFLOW_CHAINS.feature;
    const anchor = running ? running.agent : (lastAg ? lastAg.agent : null);
    let nextAg = [];
    if (anchor) {
      const idx = wfChain.indexOf(anchor);
      if (idx >= 0) nextAg = wfChain.slice(idx + 1);
    }
    if (lastAg && (!running || lastAg.agent !== running.agent)) {
      row(indent, G.done, short(lastAg.agent) + c.dim(" (fini)"), c.green);
    }
    if (running) {
      // append a live chrono so the line changes every second — visible heartbeat
      // even while a single agent runs for minutes. Reserve room for it so the
      // clip below never eats the timer.
      const age = fmtElapsed(running.since);
      const tail = age ? "  " + age : "";
      const head = short(running.agent) + (running.desc ? "  " + running.desc : "");
      const budget = Math.max(1, w - indent - 2 - tail.length);
      const shown = head.length > budget ? head.slice(0, Math.max(1, budget - 1)) + "…" : head;
      row(indent, G.current, shown + tail, cur);
    }
    for (const a of nextAg.slice(0, 5)) row(indent, G.todo, short(a), c.dim);
    if (!running && !lastAg) row(indent, G.todo, "aucun agent actif", c.dim);
  }
}

function watchRequireMemory(projectDir) {
  if (fs.existsSync(path.join(projectDir, "memory"))) return;
  console.error(`\n${c.yellow("memory/ introuvable")} dans ${projectDir}.`);
  console.error(`Lance d'abord : ${c.cyan("npx @s2bp/ai-led-framework init")}\n`);
  process.exit(1);
}

function watch() {
  const projectDir = cwd;
  watchRequireMemory(projectDir);
  const memDir = path.join(projectDir, "memory");
  const once = argv.includes("--once");
  const widthFlag = parseInt(flag("width") || "", 10);

  const frame = () => {
    const epics = parseEpics(safeRead(path.join(memDir, "epics.md")));
    const tickets = parseKanbanFull(safeRead(path.join(memDir, "kanban.md")));
    const rt = readRuntime(projectDir);
    const w = widthFlag > 0 ? widthFlag : Math.max(20, process.stdout.columns || 34);
    return buildSidebar(epics, tickets, rt, w).join("\n");
  };

  if (once) { console.log(frame()); return; }

  process.stdout.write("\x1b[?25l"); // hide cursor
  let last = null;
  // \x1b[3J clears the scrollback too — on VTE terminals (Tilix, GNOME Terminal)
  // a plain \x1b[2J pushes the erased frame into scrollback, so every redraw would
  // stack a stale copy in the history. Home + clear-screen + clear-scrollback.
  const CLEAR = "\x1b[H\x1b[2J\x1b[3J";
  const tick = () => {
    try {
      const out = frame();
      if (out !== last) { last = out; process.stdout.write(CLEAR + out + "\n"); }
    } catch (_) { /* keep the loop alive */ }
  };
  tick();
  // 500ms so the live elapsed timers (running agent / last tool) advance smoothly;
  // the diff above still skips redraws when nothing actually changed.
  const iv = setInterval(tick, 500);
  const stop = () => { clearInterval(iv); process.stdout.write("\x1b[?25h\n"); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

function shQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function writeZellijLayout(projectDir, width, scriptCmd, rightCmd) {
  const dir = path.join(projectDir, ".ailed");
  const nodeBin = process.execPath;
  const kdl = `// Generated by ai-led dashboard — run with: zellij --layout .ailed/dashboard.kdl
layout {
    pane size=${width} {
        command "${nodeBin}"
        args "${__filename}" "watch"
    }
    pane {
        command "${rightCmd}"
    }
}
`;
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "dashboard.kdl"), kdl); } catch (_) {}
}

function dashboard() {
  const projectDir = cwd;
  watchRequireMemory(projectDir);
  const cp = require("child_process");
  const width = parseInt(flag("width") || "34", 10) || 34;
  const rightCmd = flag("cmd") || "claude";
  const scriptCmd = `${process.execPath} ${shQuote(__filename)} watch`;
  const has = (bin) => {
    try { return cp.spawnSync("sh", ["-c", "command -v " + bin], { stdio: "ignore" }).status === 0; }
    catch (_) { return false; }
  };

  writeZellijLayout(projectDir, width, scriptCmd, rightCmd);

  if (has("tmux")) {
    if (process.env.TMUX) {
      // already inside tmux → add the sidebar to the LEFT of the current pane
      console.log(c.dim("Ouverture du panneau de progression à gauche (tmux)…"));
      cp.spawnSync("tmux", ["split-window", "-hb", "-l", String(width), scriptCmd], { stdio: "inherit" });
      cp.spawnSync("tmux", ["select-pane", "-R"], { stdio: "ignore" });
      return;
    }
    // fresh tmux session: pane0 = watch (left), pane1 = claude (right, focused)
    const script = [
      `tmux new-session -d -s ailed ${shQuote(scriptCmd)}`,
      `tmux split-window -h -t ailed ${shQuote(rightCmd)}`,
      `tmux resize-pane -t ailed.0 -x ${width}`,
      `tmux select-pane -t ailed.1`,
      `tmux attach -t ailed`,
    ].join(" && ");
    console.log(c.dim(`Lancement du dashboard tmux (gauche: progression · droite: ${rightCmd})…`));
    const r = cp.spawnSync("sh", ["-c", script], { stdio: "inherit" });
    if (r.status !== 0) console.error(c.yellow("\ntmux a échoué. Essaie le repli zellij ci-dessous."));
    return;
  }

  if (has("zellij")) {
    console.log(c.dim("tmux absent — lancement via zellij…"));
    cp.spawnSync("zellij", ["--layout", path.join(projectDir, ".ailed", "dashboard.kdl")], { stdio: "inherit" });
    return;
  }

  console.error(`\n${c.yellow("Ni tmux ni zellij détectés.")}`);
  console.error("Installe l'un des deux, ou ouvre deux panneaux manuellement :");
  console.error(`  gauche : ${c.cyan("npx @s2bp/ai-led-framework watch")}`);
  console.error(`  droite : ${c.cyan(rightCmd)}\n`);
  console.error(c.dim(`Un layout zellij a été généré : .ailed/dashboard.kdl`));
  process.exit(1);
}

// set/replace the `model:` line inside a markdown frontmatter block
function setFrontmatterModel(txt, tier) {
  const lines = txt.split("\n");
  if (lines[0].trim() !== "---") return txt; // no frontmatter → leave as-is
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { close = i; break; }
  }
  if (close === -1) return txt;
  for (let i = 1; i < close; i++) {
    if (/^model:/.test(lines[i])) { lines[i] = `model: ${tier}`; return lines.join("\n"); }
  }
  lines.splice(close, 0, `model: ${tier}`); // no model line yet → insert before close
  return lines.join("\n");
}

// resolve the effective model map from config.md (falls back to defaults),
// then apply per-agent --model-<name> flags as one-off overrides
function resolveModelsFromProject() {
  const cfgPath = path.join(cwd, "memory", "config.md");
  let models = { ...AGENT_MODEL_TIERS };
  let src = "défauts intégrés";
  if (fs.existsSync(cfgPath)) {
    models = { ...models, ...parseModelsTable(fs.readFileSync(cfgPath, "utf8")) };
    src = "memory/config.md";
  }
  for (const agent of Object.keys(models)) {
    const v = flag(`model-${agent.replace(/^ailed-/, "")}`);
    if (v && MODEL_TIERS.includes(v.toLowerCase())) models[agent] = v.toLowerCase();
  }
  return { models, src };
}

// ── models list: print the effective per-agent model policy ───
function modelsList() {
  const { models, src } = resolveModelsFromProject();
  console.log(`\n${c.bold("Modèles LLM par agent")} ${c.dim("(source : " + src + ")")}\n`);
  console.log(renderModelsTable(models, "fr"));
  console.log(c.dim("\nÉdite la table dans memory/config.md puis lance `models sync` pour l'appliquer.\n"));
}

// ── models sync: apply the config.md model policy to agent frontmatters ──
function modelsSync() {
  console.log(`\n${c.bold("AI-Led")} ${c.dim("v" + pkg.version)} — synchronisation des modèles dans ${c.cyan(cwd)}`);
  const agentsDir = path.join(cwd, ".claude", "agents");
  if (!fs.existsSync(agentsDir)) {
    console.error(`\n${c.yellow(".claude/agents/ introuvable")} — lance d'abord ${c.cyan("init")}.\n`);
    process.exit(1);
  }
  const { models, src } = resolveModelsFromProject();
  if (src !== "memory/config.md") {
    console.log(c.dim("  memory/config.md absent — application des valeurs par défaut."));
  }
  let changed = 0, unchanged = 0;
  for (const f of fs.readdirSync(agentsDir)) {
    if (!f.endsWith(".md")) continue;
    const name = path.basename(f, ".md");
    const tier = models[name];
    if (!tier) continue; // unknown/non-ailed agent → leave untouched
    const p = path.join(agentsDir, f);
    const txt = fs.readFileSync(p, "utf8");
    const updated = setFrontmatterModel(txt, tier);
    if (updated === txt) { unchanged++; continue; }
    fs.writeFileSync(p, updated);
    changed++;
    console.log(`  ${c.green("~")}    ${name} ${c.dim("→ " + tier)}`);
  }
  console.log(`\n${c.green("✓")} Modèles synchronisés : ${c.bold(changed)} modifié(s), ${unchanged} inchangé(s).`);
  console.log(c.dim("  Source : memory/config.md (table « Modèles LLM par agent »).\n"));
}

function help() {
  console.log(`
${c.bold("ai-led")} ${c.dim("v" + pkg.version)} — framework de workflow AI-led pour Claude Code

${c.bold("Usage")}
  npx @s2bp/ai-led-framework <command> [options]

${c.bold("Commands")}
  init            Installe agents, skills et mémoire dans le projet courant
  update          Met à jour le framework (agents/skills/commands) en préservant memory/ et CLAUDE.md
  status          Affiche l'état du projet (terminal) ; --html pour un tableau de bord navigateur
  watch           Panneau de progression vertical (epics → tâches → agents), rafraîchi en continu
  dashboard       Ouvre un split (gauche: watch figé · droite: claude) via tmux ou zellij
  models          Affiche le modèle LLM de chaque agent (source : memory/config.md)
  models sync     Applique la table « Modèles LLM » de memory/config.md aux frontmatters d'agents
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
  --model-<agent>=TIER  Modèle d'un agent (ex. --model-dev=opus) ; TIER : opus | sonnet | haiku | inherit
  -y, --yes           Mode non interactif (valeurs par défaut / flags fournis)
  -f, --force         Écrase les fichiers existants (par défaut : ignorés)

${c.bold("Modèles LLM par agent")}
  Chaque agent tourne sur un modèle choisi selon sa fonction (opus = raisonnement/critique,
  sonnet = exécution, haiku = collecte mécanique) pour réduire la conso de tokens. La table
  vit dans memory/config.md (source de vérité) ; ${c.cyan("models")} l'affiche, ${c.cyan("models sync")} l'applique
  aux frontmatters. Override ponctuel à l'install/sync via ${c.dim("--model-<agent>=<tier>")}.

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

${c.bold("Options de watch / dashboard")}
  --once              (watch) Affiche le panneau une fois puis quitte (utile pour scripter)
  --width=N           Largeur du panneau de progression (défaut : largeur du terminal / 34)
  --cmd=COMMANDE      (dashboard) Commande lancée à droite du split (défaut : claude)

  Le panneau « agent en cours / suivant » est alimenté par le hook .claude/hooks/ailed-runtime-hook.js
  (installé par init/update) qui écrit .ailed/runtime.json à chaque appel d'un sous-agent ailed-*.

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
    case "watch":
      watch();
      break;
    case "dashboard":
      dashboard();
      break;
    case "models":
      if (argv[1] === "sync") modelsSync();
      else modelsList();
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
