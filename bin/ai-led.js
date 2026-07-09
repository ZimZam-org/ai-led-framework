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
// well-known statuses, used for column ordering and known badge colors — any other
// status found in memory/kanban.md is still kept and displayed (as its raw text),
// never silently dropped
const STATUSES = ["TO_CHECK", "TODO", "IN_PROGRESS", "TO_TEST", "DONE"];

// tickets often carry decoration around the status ("✅ **DONE**, mergé `main`",
// "🔧 **IN_PROGRESS** (correctif)", "DONE (v1.4.0)") — search for a known status as a
// whole word anywhere in the cell, rather than requiring it at the very start, so emoji/
// markdown/trailing notes in any position never stop the ticket from being recognized
// and grouped under its real status
function canonicalStatus(raw) {
  const up = String(raw || "").toUpperCase();
  for (const s of STATUSES) {
    if (new RegExp("(?:^|[^A-Z_])" + s + "(?:[^A-Z_]|$)").test(up)) return s;
  }
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
// the ticket "title" column shows up under several names across real kanban.md tables
// ("Titre", "Title", but also "Objet" or "Résumé" in some hand-written sections) — match
// any of them so those tables aren't skipped wholesale for lacking an exact "Titre" header
function titleColIdx(lo) {
  if (lo.indexOf("titre") >= 0) return lo.indexOf("titre");
  if (lo.indexOf("title") >= 0) return lo.indexOf("title");
  return lo.findIndex((c) => /objet|r[ée]sum[ée]/.test(c));
}
// same idea for the ticket-id column: some hand-written tables header it "Ticket Notion"
// rather than a bare "Ticket"/"ID", which an exact-match lookup misses entirely
function idColIdx(lo) {
  if (lo.indexOf("id") >= 0) return lo.indexOf("id");
  if (lo.indexOf("ticket") >= 0) return lo.indexOf("ticket");
  return lo.findIndex((c) => /ticket/.test(c));
}
// strip a leading/trailing run of markdown/quote/emoji decoration a table cell may
// carry ("**DONE**", "✅ **DONE**", "**✅ DONE** (PR #187)") so all of them reduce to
// the same base text and group/color identically. Emoji and markdown wrappers can
// nest in either order ("✅ **X**" or "**✅ X**"), so both are stripped from the same
// character class rather than in two separate passes — a two-pass strip would leave
// e.g. the emoji inside "**✅ X**" stuck to the text after the "**" is removed, which
// then fails canonical status matching and silently mis-buckets the ticket.
function stripWrappers(raw) {
  const deco = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}`*'\s]/u;
  return String(raw || "").trim()
    .replace(new RegExp("^(?:" + deco.source + ")+", "u"), "")
    .replace(new RegExp("(?:" + deco.source + ")+$", "u"), "")
    .trim();
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
    const statusIdx = lo.indexOf("status") >= 0 ? lo.indexOf("status") : lo.indexOf("statut");
    const titleIdx = titleColIdx(lo);
    if (statusIdx >= 0 && titleIdx >= 0) {
      map = {
        status: statusIdx,
        title: titleIdx,
        id: idColIdx(lo),
      };
      continue;
    }
    if (isSeparatorRow(line) || !map) continue;
    const cell = parseStatusCell(cs[map.status]);
    if (!cell.base) continue;
    const st = cell.canonical || unknownStatusLabel(cell.base).label;
    if (!cols[st]) cols[st] = [];
    cols[st].push({ id: map.id >= 0 ? stripWrappers(cs[map.id]) : "", title: map.title >= 0 ? cs[map.title] : "" });
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
    const total = Object.values(board).reduce((n, arr) => n + arr.length, 0);
    const done = board.DONE.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const extra = Object.keys(board).filter((s) => STATUSES.indexOf(s) < 0 && board[s].length);
    const cols = STATUSES.concat(extra).map((s) => `${s} ${c.bold(board[s].length)}`).join("   ");
    console.log(`  ${c.bold("Avancement")}  ${c.green(progressBar(pct, 24))} ${c.bold(pct + "%")}  ${c.dim(`(${done}/${total} tickets DONE)`)}`);
    console.log(`  ${c.bold("Kanban")}      ${cols}\n`);
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

// ── kanban tree view (EPIC → ticket, with Status/Priority/Effort/Solution badges) ──

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// assigns each distinct value its own hue, spaced by the golden angle so that even
// near-identical strings (e.g. "P0"/"P1"/"P2") land on visually distinct colors —
// a plain hash-mod-360 clusters those together since the input strings are so similar
function makeColorAssigner() {
  const hues = new Map();
  const GOLDEN_ANGLE = 137.508;
  let i = 0;
  return function colorOf(val) {
    const v = String(val || "").trim();
    if (!v || v === "—") return null;
    if (!hues.has(v)) { hues.set(v, Math.round((i * GOLDEN_ANGLE) % 360)); i++; }
    return hues.get(v);
  };
}
function hueStyle(hue) {
  return `background:hsla(${hue},65%,50%,.16);border-color:hsla(${hue},60%,55%,.45);color:hsl(${hue},70%,80%)`;
}

// a colored pill for an open-vocabulary value, or a muted dash when empty
function valueBadge(val, colorOf) {
  const v = stripWrappers(val);
  if (!v || v === "—") return `<span class="badge muted">—</span>`;
  return `<span class="badge" style="${hueStyle(colorOf(v))}">${escHtml(v)}</span>`;
}

// Solution(s) can list several short IDs (comma/slash separated) → one badge each
function solutionBadges(val, colorOf) {
  const v = stripWrappers(val);
  if (!v || v === "—") return `<span class="badge muted">—</span>`;
  const parts = v.split(/[,/]/).map((s) => stripWrappers(s)).filter(Boolean);
  if (!parts.length) return `<span class="badge muted">—</span>`;
  return parts.map((p) => `<span class="badge" style="${hueStyle(colorOf(p))}">${escHtml(p)}</span>`).join(" ");
}

// a status cell keeps its full raw text (any decoration, trailing note, "(...)" or not)
// as-is for display/tooltip — canonicalStatus() does the recognition work by searching
// the raw text for a known status word, so nothing here needs to "clean" the cell down
// to an exact base before matching
function parseStatusCell(raw) {
  const base = String(raw || "").trim();
  return { base, canonical: canonicalStatus(base) };
}

// best-effort cosmetic cleanup for a status that isn't one of the 5 known ones: split
// off a trailing "(...)" note and strip markdown/emoji wrappers, so e.g. "**Idea**
// (backlog, non planifié)" renders as the short label "Idea" with the detail reachable
// as a hover tooltip, instead of the parenthetical leaking into the visible badge
function unknownStatusLabel(raw) {
  const s = String(raw || "").trim();
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s);
  return { label: stripWrappers(m ? m[1] : s), extra: m ? m[2].trim() : "" };
}

// known statuses render as a clean fixed-color pill (st-TODO, st-DONE...) — the exact
// canonical word, not the raw cell text, so emoji/markdown/trailing notes around it
// ("✅ **DONE**, mergé `main`", "DONE (v1.4.0)") never leak into the visible label; the
// full raw text is still reachable as a hover tooltip. Anything else gets a best-effort
// cleaned label and a hue-based color instead of being dropped.
function statusBadge(rawLabel, status, colorOf) {
  const raw = String(rawLabel || "").trim();
  if (STATUSES.indexOf(status) >= 0) {
    const titleAttr = raw && raw !== status ? ` title="${escHtml(raw)}"` : "";
    return `<span class="badge st-${status}"${titleAttr}>${status}</span>`;
  }
  const split = unknownStatusLabel(raw);
  const label = escHtml(split.label || status || "—");
  const tooltip = split.extra || (raw !== split.label ? raw : "");
  const titleAttr = tooltip ? ` title="${escHtml(tooltip)}"` : "";
  if (!colorOf) return `<span class="badge muted"${titleAttr}>${label}</span>`;
  return `<span class="badge" style="${hueStyle(colorOf(status))}"${titleAttr}>${label}</span>`;
}

// one <dt>/<dd> pair for the detail popup
function detailRow(label, val) {
  const v = String(val || "").trim();
  return `<dt>${escHtml(label)}</dt><dd>${v && v !== "—" ? escHtml(v) : "—"}</dd>`;
}

// aggregate an EPIC's status from its tickets; falls back to the epics.md status when it has none
function epicAggStatus(epic, tickets) {
  const ts = tickets.filter((t) => epic.id && t.epic === epic.id);
  if (!ts.length) return { done: "DONE", current: "IN_PROGRESS", todo: "TODO" }[epic.status] || "TODO";
  if (ts.some((t) => t.status === "IN_PROGRESS")) return "IN_PROGRESS";
  if (ts.some((t) => t.status === "TO_CHECK")) return "TO_CHECK";
  if (ts.some((t) => t.status === "TO_TEST")) return "TO_TEST";
  if (ts.every((t) => t.status === "DONE")) return "DONE";
  return "TODO";
}

function kanbanHtml(epics, tickets, outPath) {
  const withStatus = epics.map((e) => ({ ...e, agg: epicAggStatus(e, tickets) }));
  const knownIds = new Set(withStatus.map((e) => e.id));
  // tickets referencing an EPIC id absent from epics.md still get a (title-less) bucket
  for (const t of tickets) {
    if (t.epic && !knownIds.has(t.epic)) {
      knownIds.add(t.epic);
      withStatus.push({ id: t.epic, title: "", status: "todo", priority: "", agg: epicAggStatus({ id: t.epic, status: "todo" }, tickets) });
    }
  }

  const colorOf = makeColorAssigner(); // shared so the same Prio/Effort/Solution value always gets the same hue
  const details = {};

  const ticketRow = (t) => {
    details["t:" + t.id] = {
      title: t.title || "(sans titre)",
      id: t.id,
      bodyHtml: detailRow("Statut", t.statusRaw || t.status)
        + detailRow("EPIC", t.epic)
        + detailRow("Priorité", t.priority)
        + detailRow("Effort", t.effort)
        + detailRow("Solution(s)", t.solution)
        + detailRow("Description", t.description)
        + detailRow("Détail technique", t.technicalDetail)
        + detailRow("Maquette", t.mockup),
    };
    return `
      <tr class="ticket-row">
        <td class="depth"></td>
        <td class="tid">${escHtml(t.id)}</td>
        <td class="ttitle"><span class="title-link" data-key="t:${escHtml(t.id)}">${escHtml(t.title) || "<em>(sans titre)</em>"}</span></td>
        <td>${statusBadge(t.statusRaw, t.status, colorOf)}</td>
        <td>${valueBadge(t.priority, colorOf)}</td>
        <td>${valueBadge(t.effort, colorOf)}</td>
        <td>${solutionBadges(t.solution, colorOf)}</td>
      </tr>`;
  };

  const epicGroup = (epic) => {
    const linked = tickets.filter((t) => epic.id && t.epic === epic.id);
    details["e:" + epic.id] = {
      title: epic.title || "(sans titre)",
      id: epic.id,
      bodyHtml: detailRow("Statut", epic.agg)
        + detailRow("Priorité", epic.priority)
        + detailRow("Objectif", epic.objective)
        + detailRow("Features SPEC", epic.specFeatures)
        + detailRow("Solutions cibles", epic.solutions),
    };
    const rows = linked.length ? linked.map(ticketRow).join("") :
      `<tr class="ticket-row"><td class="depth"></td><td colspan="6" class="empty">Aucun ticket rattaché.</td></tr>`;
    const collapsed = epic.agg === "DONE" ? " collapsed" : "";
    return `
    <tbody class="epic-group${collapsed}">
      <tr class="epic-row" onclick="toggleGroup(this)">
        <td class="chev"></td>
        <td class="eid">${escHtml(epic.id)}</td>
        <td class="etitle"><span class="title-link" data-key="e:${escHtml(epic.id)}">${escHtml(epic.title) || "<em>(sans titre)</em>"}</span> <span class="badge count">${linked.length} tâche${linked.length > 1 ? "s" : ""}</span></td>
        <td>${statusBadge(epic.agg, epic.agg, colorOf)}</td>
        <td>${epic.priority ? valueBadge(epic.priority, colorOf) : ""}</td>
        <td></td>
        <td></td>
      </tr>
${rows}
    </tbody>`;
  };

  const orphans = tickets.filter((t) => !t.epic);
  const orphanGroup = orphans.length ? `
    <tbody class="epic-group">
      <tr class="epic-row" onclick="toggleGroup(this)">
        <td class="chev"></td>
        <td class="eid">—</td>
        <td class="etitle">Sans EPIC <span class="badge count">${orphans.length} tâche${orphans.length > 1 ? "s" : ""}</span></td>
        <td><span class="badge muted">—</span></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
${orphans.map(ticketRow).join("")}
    </tbody>` : "";

  const total = tickets.length;
  const done = tickets.filter((t) => t.status === "DONE").length;
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");
  const body = withStatus.map(epicGroup).join("") + orphanGroup;
  const detailsJson = JSON.stringify(details).replace(/<\//g, "<\\/");

  fs.writeFileSync(outPath, KANBAN_HTML_TEMPLATE
    .replace("__GENERATED__", generated)
    .replace("__SUMMARY__", `${withStatus.length} EPIC${withStatus.length > 1 ? "s" : ""} · ${done}/${total} tickets DONE`)
    .replace("/*__DETAILS__*/", detailsJson)
    .replace("/*__BODY__*/", body || `<tbody><tr><td class="empty">Aucune EPIC ni ticket dans memory/epics.md / memory/kanban.md.</td></tr></tbody>`));
}

const KANBAN_HTML_TEMPLATE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI-Led — Kanban</title>
<style>
  :root { --bg:#0f1117; --panel:#171a21; --panel2:#1d212b; --border:#252a34; --text:#e6e8eb; --muted:#8b929e; --accent:#6ea8fe;
    --sTO_CHECK:#c08be8; --sTODO:#8b929e; --sIN_PROGRESS:#6ea8fe; --sTO_TEST:#f0c674; --sDONE:#6cc070; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--text); }
  header { padding:18px 28px; border-bottom:1px solid var(--border); display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  header h1 { margin:0; font-size:18px; }
  header .gen { color:var(--muted); font-size:13px; }
  header .sum { margin-left:auto; color:var(--muted); font-size:13px; }
  main { max-width:1200px; margin:0 auto; padding:24px 28px 80px; }
  table.kanban { width:100%; border-collapse:collapse; font-size:14px; }
  table.kanban th { text-align:left; color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; padding:0 10px 8px; font-weight:600; }
  table.kanban tbody.epic-group { border-top:8px solid var(--bg); }
  table.kanban td { padding:8px 10px; border-top:1px solid var(--border); vertical-align:middle; }
  .epic-row { background:var(--panel); cursor:pointer; }
  .epic-row:hover { background:var(--panel2); }
  .epic-row td { border-top:1px solid var(--border); font-weight:600; }
  .epic-row .chev:before { content:"▾"; color:var(--muted); display:inline-block; width:14px; }
  tbody.collapsed .epic-row .chev:before { content:"▸"; }
  tbody.collapsed .ticket-row { display:none; }
  .epic-row .eid { font-family:ui-monospace,monospace; color:var(--accent); font-weight:400; font-size:13px; }
  .ticket-row { background:var(--panel2); }
  .ticket-row td.depth { width:14px; padding:8px 0 8px 10px; position:relative; }
  .ticket-row td.depth:before { content:""; position:absolute; left:16px; top:0; bottom:0; width:1px; background:var(--border); }
  .ticket-row .tid { font-family:ui-monospace,monospace; color:var(--muted); font-size:12px; white-space:nowrap; }
  .empty { color:var(--muted); font-style:italic; font-size:13px; }
  .badge { display:inline-block; border-radius:999px; padding:2px 10px; font-size:12px; border:1px solid var(--border); white-space:nowrap; }
  .badge.muted { color:var(--muted); background:var(--panel2); }
  .badge.count { color:var(--muted); background:var(--panel2); font-weight:400; margin-left:6px; }
  .badge.st-TO_CHECK { background:rgba(192,139,232,.16); border-color:rgba(192,139,232,.45); color:#dcb9ef; }
  .badge.st-TODO { background:rgba(139,146,158,.16); border-color:rgba(139,146,158,.45); color:#c7ccd4; }
  .badge.st-IN_PROGRESS { background:rgba(110,168,254,.16); border-color:rgba(110,168,254,.45); color:#b7d2ff; }
  .badge.st-TO_TEST { background:rgba(240,198,116,.16); border-color:rgba(240,198,116,.45); color:#f3d99b; }
  .badge.st-DONE { background:rgba(108,192,112,.16); border-color:rgba(108,192,112,.45); color:#bfe6c2; }
  .title-link { cursor:pointer; } .title-link:hover { text-decoration:underline; color:var(--accent); }
  .overlay { position:fixed; inset:0; background:rgba(4,5,8,.65); display:none; align-items:center; justify-content:center; padding:24px; z-index:50; }
  .overlay.open { display:flex; }
  .modal { position:relative; background:var(--panel); border:1px solid var(--border); border-radius:12px; max-width:620px; width:100%; max-height:80vh; overflow:auto; padding:22px 24px; }
  .modal .mclose { position:absolute; top:12px; right:12px; background:var(--panel2); border:1px solid var(--border); color:var(--text); border-radius:8px; width:28px; height:28px; cursor:pointer; font-size:14px; }
  .modal .mclose:hover { border-color:var(--accent); }
  .modal .mid { font-family:ui-monospace,monospace; color:var(--accent); font-size:12px; }
  .modal h2 { margin:4px 0 0; font-size:17px; padding-right:24px; }
  .modal dl { margin:16px 0 0; }
  .modal dt { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; margin-top:12px; }
  .modal dt:first-child { margin-top:0; }
  .modal dd { margin:3px 0 0; white-space:pre-wrap; }
</style>
</head>
<body>
<header>
  <h1>AI-Led — Kanban</h1>
  <span class="gen">généré le __GENERATED__ · lecture seule</span>
  <span class="sum">__SUMMARY__</span>
</header>
<main>
  <table class="kanban">
    <thead>
      <tr><th></th><th>ID</th><th>Titre</th><th>Statut</th><th>Priorité</th><th>Effort</th><th>Solution(s)</th></tr>
    </thead>
/*__BODY__*/
  </table>
</main>
<div id="overlay" class="overlay" onclick="if(event.target===this) closeDetail()">
  <div class="modal">
    <button class="mclose" type="button" onclick="closeDetail()" aria-label="Fermer">✕</button>
    <div class="mid" id="mId"></div>
    <h2 id="mTitle"></h2>
    <dl id="mBody"></dl>
  </div>
</div>
<script>
  var DETAILS = /*__DETAILS__*/;
  function toggleGroup(row) { row.parentElement.classList.toggle("collapsed"); }
  function closeDetail() { document.getElementById("overlay").classList.remove("open"); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDetail(); });
  document.querySelectorAll(".title-link").forEach(function (el) {
    el.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var d = DETAILS[el.getAttribute("data-key")];
      if (!d) return;
      document.getElementById("mId").textContent = d.id;
      document.getElementById("mTitle").textContent = d.title;
      document.getElementById("mBody").innerHTML = d.bodyHtml;
      document.getElementById("overlay").classList.add("open");
    });
  });
</script>
</body>
</html>
`;

function kanban() {
  const memDir = path.join(cwd, "memory");
  if (!fs.existsSync(memDir)) {
    console.error(`\n${c.yellow("memory/ introuvable")} dans ${cwd}.`);
    console.error(`Lance d'abord : ${c.cyan("npx @s2bp/ai-led-framework init")}\n`);
    process.exit(1);
  }
  const epics = parseEpics(safeRead(path.join(memDir, "epics.md")));
  const tickets = parseKanbanFull(safeRead(path.join(memDir, "kanban.md")));
  if (argv.includes("--html")) {
    const out = path.resolve(cwd, flag("out") || "ailed-kanban.html");
    kanbanHtml(epics, tickets, out);
    console.log(`\n${c.green("✓")} Arborescence Kanban générée : ${c.cyan(path.relative(cwd, out) || out)}`);
    console.log(`  Ouvre-la dans un navigateur : ${c.dim("file://" + out)}\n`);
  } else {
    console.log(`\n${c.dim("Vue arborescente :")} npx @s2bp/ai-led-framework kanban --html\n`);
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
  <button id="toggleDetail" class="toggle" type="button" aria-expanded="false">▸ Détail de la mémoire (lecture des fichiers bruts)</button>
  <div id="detailWrap" hidden>
    <div id="toc" class="toc"></div>
    <div id="detail"></div>
  </div>
</main>
<script>
  var DATA = /*__DATA__*/;
  var STYLE = "__STYLE__";
  var STATUSES = ['TO_CHECK','TODO','IN_PROGRESS','TO_TEST','DONE'];
  // search for a known status as a whole word anywhere in the cell (not just at the
  // start), so emoji/markdown/trailing notes around it never stop the ticket from
  // being recognized and grouped under its real status
  function canonicalStatus(raw){
    var up = String(raw||'').toUpperCase();
    for (var i=0;i<STATUSES.length;i++){
      if (new RegExp('(?:^|[^A-Z_])'+STATUSES[i]+'(?:[^A-Z_]|$)').test(up)) return STATUSES[i];
    }
    return null;
  }
  function stripWrappers(raw){
    var deco = /[\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}\`*'\\s]/u;
    return String(raw||'').trim()
      .replace(new RegExp('^(?:'+deco.source+')+','u'),'')
      .replace(new RegExp('(?:'+deco.source+')+$','u'),'')
      .trim();
  }
  function staleLimit(name){ return name === 'market-watch' ? 30 : 60; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function get(name){ return DATA.filter(function(e){ return e.name===name; })[0]; }
  function cells(line){ return line.trim().split('|').slice(1,-1).map(function(s){ return s.trim(); }); }
  function isSep(line){ return /^[-\\s|]+$/.test(line.trim()); }
  function titleColIdx(lo){
    if (lo.indexOf('titre')>=0) return lo.indexOf('titre');
    if (lo.indexOf('title')>=0) return lo.indexOf('title');
    return lo.findIndex(function(c){ return /objet|r[\\u00e9e]sum[\\u00e9e]/.test(c); });
  }
  function idColIdx(lo){
    if (lo.indexOf('id')>=0) return lo.indexOf('id');
    if (lo.indexOf('ticket')>=0) return lo.indexOf('ticket');
    return lo.findIndex(function(c){ return /ticket/.test(c); });
  }

  function parseBoard(md){
    var cols={}; STATUSES.forEach(function(s){ cols[s]=[]; });
    if(!md) return cols; var map=null;
    md.split('\\n').forEach(function(line){
      if(line.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(line), lo=cs.map(function(c){ return c.toLowerCase(); });
      var statusIdx = lo.indexOf('status')>=0 ? lo.indexOf('status') : lo.indexOf('statut');
      var titleIdx = titleColIdx(lo);
      if(statusIdx>=0 && titleIdx>=0){
        map={ status:statusIdx, title:titleIdx, id:idColIdx(lo) };
        return;
      }
      if(isSep(line)||!map) return;
      var base=String(cs[map.status]||'').trim();
      if(!base) return;
      var st=canonicalStatus(base)||stripWrappers(base);
      if(!cols[st]) cols[st]=[];
      cols[st].push({ id:map.id>=0?stripWrappers(cs[map.id]):'', title:map.title>=0?cs[map.title]:'' });
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
  // camembert (pie) à partir de segments [{value,color}] ; tranche DONE en tête
  function pieSvg(segs){
    var tot=segs.reduce(function(n,s){ return n+s.value; },0);
    if(!tot) return '<svg width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="56" fill="var(--panel2)" stroke="var(--border)"/><text x="64" y="68" text-anchor="middle" fill="var(--muted)" font-size="13">aucun</text></svg>';
    var cx=64, cy=64, r=56, a=-Math.PI/2, parts='';
    segs.forEach(function(s){
      if(!s.value) return;
      var frac=s.value/tot, a2=a+frac*2*Math.PI;
      if(frac>=0.99999){ parts+='<circle cx="64" cy="64" r="'+r+'" fill="'+s.color+'"/>'; a=a2; return; }
      var x1=cx+r*Math.cos(a), y1=cy+r*Math.sin(a), x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
      parts+='<path d="M'+cx+' '+cy+' L'+x1.toFixed(2)+' '+y1.toFixed(2)+' A'+r+' '+r+' 0 '+(frac>0.5?1:0)+' 1 '+x2.toFixed(2)+' '+y2.toFixed(2)+' Z" fill="'+s.color+'"/>';
      a=a2;
    });
    return '<svg width="128" height="128" viewBox="0 0 128 128">'+parts+'<circle cx="64" cy="64" r="56" fill="none" stroke="var(--border)"/></svg>';
  }
  function classifyEpic(s){
    var v=(s||'').toUpperCase();
    if(/DONE|TERMIN|LIVR|CLOS/.test(v)) return 'done';
    if(/IN[_ ]?PROGRESS|EN COURS|WIP|DOING/.test(v)) return 'current';
    return 'todo';
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
      var statusIdx = lo.indexOf('status')>=0 ? lo.indexOf('status') : lo.indexOf('statut');
      var titleIdx = titleColIdx(lo);
      if(statusIdx>=0 && titleIdx>=0){
        map={ status:statusIdx, title:titleIdx, id:idColIdx(lo), epic:lo.indexOf('epic') };
        return;
      }
      if(isSep(line)||!map) return;
      var base=String(cs[map.status]||'').trim();
      if(!base) return;
      out.push({ id:map.id>=0?stripWrappers(cs[map.id]):'', title:map.title>=0?cs[map.title]:'', status:canonicalStatus(base)||stripWrappers(base), epic:map.epic>=0?stripWrappers(cs[map.epic]).toUpperCase():'' });
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
  var total = Object.keys(board).reduce(function(n,s){ return n+board[s].length; },0);
  var done = board.DONE.length;
  var pct = total ? Math.round(done/total*100) : 0;
  var summary = stateSummary((get('project-state')||{}).content);

  // ── Camemberts : avancement global + jalon en cours ───────
  // statuts hors des 5 connus (libellé custom trouvé dans le fichier) regroupés en gris "Autres"
  var otherCount = Object.keys(board).filter(function(s){ return STATUSES.indexOf(s)<0; })
    .reduce(function(n,s){ return n+board[s].length; },0);
  var globalSegs = STATUSES.slice().reverse().map(function(s){ return { value:board[s].length, color:SCOL[s], label:s, st:s }; });
  if(otherCount) globalSegs.unshift({ value:otherCount, color:'#7a8290', label:'Autres', st:'OTHER' });
  var globalLegend = globalSegs.filter(function(s){ return s.value; })
    .map(function(s){ return '<li><span class="ldot" style="background:'+s.color+'"></span>'+s.label+'<b>'+s.value+'</b></li>'; }).join('');
  var globalCard =
    '<div class="card pie-card">'
    + '<div class="piefig">'+pieSvg(globalSegs)+'</div>'
    + '<div class="pieinfo"><div class="pie-pct">'+pct+'%</div><div class="pie-sub">'+done+' / '+total+' tickets terminés</div>'
    +   '<ul class="legend">'+(globalLegend||'<li class="empty">Aucun ticket</li>')+'</ul></div>'
    + '</div>';

  var ms = milestoneProgress((get('roadmap')||{}).content, epics, tickets);
  var msCard;
  if(ms){
    var msSegs=[{ value:ms.done, color:SCOL.DONE },{ value:Math.max(0,ms.total-ms.done), color:'var(--border)' }];
    msCard =
      '<div class="card pie-card">'
      + '<div class="piefig">'+pieSvg(msSegs)+'</div>'
      + '<div class="pieinfo"><div class="pie-pct">'+ms.pct+'%<span class="approx">~ approx.</span></div>'
      +   '<div class="pie-sub">'+esc(ms.name)+'</div>'
      +   '<ul class="legend"><li><span class="ldot" style="background:'+SCOL.DONE+'"></span>Couvert<b>'+ms.done+'</b></li>'
      +     '<li><span class="ldot" style="background:var(--border)"></span>Restant<b>'+Math.max(0,ms.total-ms.done)+'</b></li>'
      +     (ms.target?'<li><span class="ldot" style="background:transparent"></span>Cible<b>'+esc(ms.target)+'</b></li>':'')+'</ul></div>'
      + '</div>';
  } else {
    msCard = '<div class="card pie-card"><div class="pieinfo"><div class="pie-sub">Aucun jalon défini (roadmap.md)</div></div></div>';
  }

  // ── Chiffres d'action : bugs / vulnérabilités / arbitrages ─
  var inc = countIncidents((get('incidents')||{}).content);
  var vul = countVulns((get('security')||{}).content);
  var arb = countCandidates((get('market-watch')||{}).content);
  function statTile(cls,target,num,label,sub){
    return '<a class="stat '+cls+(num?'':' zero')+'" href="#f-'+target+'" data-rev="f-'+target+'">'
      + '<span class="num">'+num+'</span>'
      + '<span class="lab">'+label+'<small>'+sub+'</small></span></a>';
  }
  var statsCard =
    '<div class="card stats">'
    + statTile('bug','incidents',inc,'Bugs à traiter','workflow incident')
    + statTile('vuln','security',vul.open,'Vulnérabilités',(vul.crit?vul.crit+' critiques/élevées · ':'')+'workflow sécurité')
    + statTile('arb','market-watch',arb,'Arbitrages produit','discovery → roadmap')
    + '</div>';

  // ── Timeline des EPICs ────────────────────────────────────
  var epList = epics.length ? epics : (function(){
    var seen=[]; tickets.forEach(function(t){ if(t.epic && !seen.find(function(e){return e.id===t.epic;})) seen.push({ id:t.epic, title:'', status:'todo' }); }); return seen;
  })();
  var epEff = epList.map(function(e){ var o={ id:e.id, title:e.title, eff:epicEff(e,tickets) }; return o; });
  var timelineHtml = epEff.length ? epEff.map(function(e){
    var g=e.eff==='done'?'✓':(e.eff==='current'?'▶':'·');
    return '<li class="'+e.eff+'"><span class="node">'+g+'</span><span class="ep-id">'+esc(e.id)+'</span><span class="ep-title">'+esc(e.title||'')+'</span></li>';
  }).join('') : '<li class="todo"><span class="node">·</span><span class="ep-title">Aucune EPIC définie</span></li>';

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
        return '<li style="--cc:'+col+'">'+(t.id?'<span class="tid">'+esc(t.id)+'</span>':'')+esc(t.title||'(sans titre)')+'</li>';
      }).join(''):'<div class="empty">—</div>';
      return '<div class="taskcol '+cls+'"><h4><span>'+label+'</span><span>'+arr.length+'</span></h4><ul>'+items+'</ul></div>';
    }
    curEpicHtml =
      '<div class="card"><div class="cur-epic-h"><strong><span class="eid">'+esc(curEpic.id)+'</span> '+esc(curEpic.title||'')+'</strong>'
      + '<span class="pill">'+doneT.length+'/'+pool.length+' tâches terminées</span></div>'
      + '<div class="taskcols">'
      +   tcol('done','Terminées',doneT,SCOL.DONE)
      +   tcol('cur','En cours',curT,SCOL.IN_PROGRESS)
      +   tcol('next','À venir',nextT,SCOL.TODO)
      + '</div></div>';
  } else {
    curEpicHtml = '<div class="card"><div class="empty">Aucune EPIC en cours.</div></div>';
  }

  // ── À surveiller ──────────────────────────────────────────
  var watch=[];
  DATA.forEach(function(e){ if(e.age!==null && e.age>staleLimit(e.name)) watch.push(esc(e.file)+' — '+e.age+' j sans mise à jour'); });
  var off = integ.filter(function(it){ return !it.on; }).map(function(it){ return esc(it.area); });
  if(off.length) watch.push('Intégrations désactivées : '+off.join(', '));
  if(board.TO_CHECK.length) watch.push(board.TO_CHECK.length+' clarification(s) TO_CHECK en attente');
  var watchHtml = watch.length ? watch.map(function(w){ return '<li>'+w+'</li>'; }).join('') : '<li class="empty">Rien à signaler</li>';

  document.getElementById('synth').innerHTML =
    '<h2 class="sec">Vue d\\'ensemble</h2>'
    + (summary?'<p class="lede">'+esc(summary)+'</p>':'')
    + '<div class="kpis">'+globalCard+msCard+statsCard+'</div>'
    + '<h2 class="sec">Timeline des EPICs</h2>'
    + '<div class="card"><ol class="epic-timeline">'+timelineHtml+'</ol></div>'
    + '<h2 class="sec">EPIC en cours</h2>'
    + curEpicHtml
    + '<h2 class="sec">À surveiller</h2>'
    + '<div class="card"><ul class="watch">'+watchHtml+'</ul></div>';

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

  // bouton repliable du détail de la mémoire (déplié d'office en style détaillé)
  var detailWrap=document.getElementById('detailWrap');
  var toggleBtn=document.getElementById('toggleDetail');
  function setDetail(show){
    detailWrap.hidden=!show;
    toggleBtn.setAttribute('aria-expanded', show?'true':'false');
    toggleBtn.textContent=(show?'▾':'▸')+' Détail de la mémoire (lecture des fichiers bruts)';
  }
  setDetail(STYLE==='detailed');
  toggleBtn.addEventListener('click', function(){ setDetail(detailWrap.hidden); });

  // clic sur une puce du sommaire → ouvre l'accordéon ciblé
  document.getElementById('toc').addEventListener('click', function(ev){
    var a = ev.target.closest('a'); if(!a) return;
    var el = document.getElementById(a.getAttribute('data-t')); if(el) el.open = true;
  });

  // clic sur un chiffre d'action → déplie le détail et ouvre le fichier concerné
  document.querySelector('.stats').addEventListener('click', function(ev){
    var a=ev.target.closest('.stat'); if(!a) return;
    setDetail(true);
    var el=document.getElementById(a.getAttribute('data-rev')); if(el) el.open=true;
  });

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

// parse memory/epics.md overview table → [{id,title,status,priority,objective,specFeatures,solutions}] in declaration order
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
        priority: lo.findIndex((c) => /priorit|priority/.test(c)),
        objective: lo.findIndex((c) => /objectif|goal/.test(c)),
        specFeatures: lo.findIndex((c) => /spec|feature/.test(c)),
        solutions: lo.findIndex((c) => /solution/.test(c)),
      };
      continue;
    }
    if (isSeparatorRow(line) || !map) continue;
    const id = stripWrappers(cs[map.epic]);
    if (!id || /^—$/.test(id)) continue;
    out.push({
      id,
      title: (map.title >= 0 ? cs[map.title] : "") || "",
      status: classifyEpicStatus(map.status >= 0 ? cs[map.status] : ""),
      priority: map.priority >= 0 ? stripWrappers(cs[map.priority]) : "",
      objective: map.objective >= 0 ? (cs[map.objective] || "").trim() : "",
      specFeatures: map.specFeatures >= 0 ? (cs[map.specFeatures] || "").trim() : "",
      solutions: map.solutions >= 0 ? stripWrappers(cs[map.solutions]) : "",
    });
  }
  return out;
}

// parse memory/kanban.md → [{id,title,status,epic,priority,effort,solution}] keeping the EPIC link
function parseKanbanFull(content) {
  const out = [];
  if (!content) return out;
  let map = null;
  for (const line of content.split("\n")) {
    if (line.trim().charAt(0) !== "|") { map = null; continue; }
    const cs = tableCells(line);
    const lo = cs.map((c) => c.toLowerCase());
    const statusIdx = lo.indexOf("status") >= 0 ? lo.indexOf("status") : lo.indexOf("statut");
    const titleIdx = titleColIdx(lo);
    if (statusIdx >= 0 && titleIdx >= 0) {
      map = {
        status: statusIdx,
        title: titleIdx,
        id: idColIdx(lo),
        epic: lo.indexOf("epic"),
        description: lo.indexOf("description"),
        priority: lo.findIndex((c) => /priorit|priority/.test(c)),
        effort: lo.indexOf("effort"),
        solution: lo.findIndex((c) => /solution/.test(c)),
        technicalDetail: lo.findIndex((c) => /d[ée]tail|technical/.test(c)),
        mockup: lo.findIndex((c) => /maquette|mockup/.test(c)),
      };
      continue;
    }
    if (isSeparatorRow(line) || !map) continue;
    const cell = parseStatusCell(cs[map.status]);
    if (!cell.base) continue;
    out.push({
      id: map.id >= 0 ? stripWrappers(cs[map.id]) : "",
      title: map.title >= 0 ? cs[map.title] : "",
      status: cell.canonical || unknownStatusLabel(cell.base).label,
      statusRaw: cell.base,
      epic: map.epic >= 0 ? stripWrappers(cs[map.epic]) : "",
      description: map.description >= 0 ? (cs[map.description] || "").trim() : "",
      priority: map.priority >= 0 ? stripWrappers(cs[map.priority]) : "",
      effort: map.effort >= 0 ? stripWrappers(cs[map.effort]) : "",
      solution: map.solution >= 0 ? stripWrappers(cs[map.solution]) : "",
      technicalDetail: map.technicalDetail >= 0 ? (cs[map.technicalDetail] || "").trim() : "",
      mockup: map.mockup >= 0 ? (cs[map.mockup] || "").trim() : "",
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
  const cur = (s) => `\x1b[1;33m${s}\x1b[0m`; // bold yellow = active
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
  const curEpic = withStatus[ci];

  // previous (last treated) epic
  const prev = [...withStatus.slice(0, ci)].reverse().find((e) => e.eff === "done") || withStatus[ci - 1];
  if (prev) row(0, G[prev.eff], epLabel(prev), paintOf[prev.eff]);

  // current epic
  if (curEpic) {
    row(0, G[curEpic.eff], epLabel(curEpic), paintOf[curEpic.eff]);

    const linked = tickets.filter((t) => curEpic.id && t.epic === curEpic.id);
    const etx = linked.length ? linked : (epics.length ? [] : tickets);
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
  }

  // next epic
  const next = withStatus.slice(ci + 1).find((e) => e.eff !== "done") || withStatus[ci + 1];
  if (next && next !== curEpic) row(0, G[next.eff], epLabel(next), paintOf[next.eff]);

  // footer
  const total = tickets.length;
  const done = tickets.filter((t) => t.status === "DONE").length;
  const wf = rt && rt.workflow ? rt.workflow : null;
  const running0 = rt && rt.running && rt.running[0];
  L.push("");
  // main-loop heartbeat: when no ailed-* agent is running, show the last tool the
  // main loop touched with a live chrono, so the panel still breathes during direct
  // work (Edit/Bash/Read…) instead of looking frozen.
  if (!running0 && rt && rt.lastTool && rt.lastTool.tool) {
    L.push(c.dim(`⋯ ${rt.lastTool.tool} · ${fmtElapsed(rt.lastTool.at)}`));
  }
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
  kanban --html   Génère une arborescence EPIC → ticket (ailed-kanban.html) avec badges de statut
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

${c.bold("Options de kanban")}
  --html              Génère l'arborescence HTML statique (ailed-kanban.html), sans serveur
  --out=CHEMIN        Chemin du fichier HTML généré (défaut : ailed-kanban.html)

  Une ligne par EPIC (repliable), avec le nombre de tickets rattachés et son statut agrégé
  (déduit des tickets liés) ; une ligne par ticket en dessous avec Statut / Priorité / Effort /
  Solution(s) en badges de couleur (Priorité/Effort restent vides tant que memory/kanban.md ne
  les renseigne pas au niveau ticket).

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
    case "kanban":
      kanban();
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
