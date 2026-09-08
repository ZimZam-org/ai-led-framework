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
  // PostToolUse on every tool too — the agent-completion nudge only needs Task, but the
  // ticket journal (.ailed/journal.jsonl) must see *any* write that moves a kanban status,
  // including a `sed` run through Bash. The hook itself compares the file signature, so a
  // tool that touched nothing costs one stat(). Self-healing: drop any prior ailed entries
  // first so older "Task"-only wirings are upgraded in place.
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
  const b = wire("PostToolUse", "*", "post");
  if (a || b) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
    console.log(`  ${c.green("+")}    .claude/settings.json ${c.dim("(hooks activité + journal tickets câblés)")}`);
  } else {
    console.log(`  ${c.yellow("skip")} .claude/settings.json ${c.dim("(hooks déjà à jour)")}`);
  }
}

// Les versions <= 0.15.0 généraient un rapport horodaté par run, à la racine et non ignoré :
// beaucoup de projets en ont commité. Ajouter la règle au .gitignore ne détraque pas un fichier
// déjà suivi — on le signale donc, sans jamais y toucher (supprimer des fichiers versionnés
// n'est pas au programme d'un `update`).
function warnTrackedReports() {
  let tracked = [];
  try {
    const out = require("child_process").execSync(
      "git ls-files -z -- \"*_ailed-status.html\" \"*_ailed-memory-diff.html\" ailed-status.html",
      { cwd, stdio: ["ignore", "pipe", "ignore"] }
    ).toString();
    tracked = out.split("\0").filter(Boolean);
  } catch (_) { return; } // pas un dépôt git, ou git absent : rien à signaler
  if (!tracked.length) return;
  console.log(`  ${c.yellow("!")}    ${c.bold(tracked.length)} rapport(s) généré(s) déjà suivi(s) par git ${c.dim("(versions ≤ 0.15.0)")}`);
  console.log(`       ${c.dim(tracked.slice(0, 3).join(", ") + (tracked.length > 3 ? ", …" : ""))}`);
  console.log(`       ${c.dim("Le .gitignore ne dé-suit pas un fichier déjà indexé. Pour les sortir du dépôt :")}`);
  console.log(`       ${c.cyan("git rm --cached ")}${c.dim("<fichiers>")}   ${c.dim("puis commite — le rapport vivant s'appelle désormais ailed-status.html.")}`);
}

function ensureGitignore() {
  const p = path.join(cwd, ".gitignore");
  let txt = "";
  if (fs.existsSync(p)) txt = fs.readFileSync(p, "utf8");
  const has = (v) => txt.split("\n").some((l) => l.trim() === v);
  // `.ailed/` holds the runtime state, the ticket journal and the screenshots. The
  // generated reports land at the project root and are *derived artefacts*: the live
  // dashboard, the timestamped snapshots kept for sharing, and the memory-diff reports.
  // None of them belongs in git — before this, they silently piled up as tracked files.
  const want = [".ailed/", "ailed-status.html", "*_ailed-status.html", "*_ailed-memory-diff.html"]
    .filter((v) => !has(v) && !(v === ".ailed/" && has(".ailed")));
  if (want.length) {
    // Une nouvelle entrée s'insère dans le bloc AI-Led déjà présent plutôt qu'en fin de
    // fichier : sinon chaque version y empile son propre en-tête, et le .gitignore d'un
    // projet suivi de longue date finit en accordéon de commentaires. L'en-tête existant
    // n'est pas réécrit — c'est un fichier de l'utilisateur, il a pu le retoucher.
    const lines = txt.length ? txt.replace(/\n$/, "").split("\n") : [];
    let at = -1;
    lines.forEach((l, i) => { if (/^#\s*AI-Led/i.test(l)) at = i; });
    if (at >= 0) {
      let end = at + 1;
      while (end < lines.length && lines[end].trim() !== "") end++;
      lines.splice(end, 0, ...want);
      fs.writeFileSync(p, lines.join("\n") + "\n");
    } else {
      const add = (txt && !txt.endsWith("\n") ? "\n" : "")
        + "\n# AI-Led: runtime state (sidebar, ticket journal, screenshots) + generated reports\n"
        + want.join("\n") + "\n";
      fs.writeFileSync(p, txt + add);
    }
    console.log(`  ${c.green("+")}    .gitignore ${c.dim("(+ " + want.join(" + ") + ")")}`);
  }
  // hors de la branche ci-dessus : le rappel doit rester visible aux updates suivants,
  // tant que des rapports générés traînent réellement dans l'index git.
  warnTrackedReports();
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

// Normalise a raw kanban status cell into a canonical status, tolerant to the way
// statuses are actually written in the wild: backticks (the template styles them as
// `IN_PROGRESS`), lower/mixed case, accents, spaces/hyphens, FR/EN wording, and a
// trailing comment (`DONE (PR #118, merged develop)` → `DONE`).
// Also recognises SUPERSEDED (voided work): returned as a status but deliberately
// absent from STATUSES, so it never inflates the progress counters.
// Returns null when nothing plausible matches.
function normStatus(raw) {
  let v = String(raw || "")
    .replace(/`/g, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .trim().toUpperCase().replace(/[\s\-–—]+/g, "_");
  v = v.split("(")[0].replace(/^_+|_+$/g, "");
  if (!v) return null;
  if (STATUSES.indexOf(v) >= 0) return v;
  // prefix-anchored: tolerates any trailing qualifier after the status token
  if (/^(IN_?PROGRESS|EN_?COURS|WIP|DOING|ONGOING)(_|$)/.test(v)) return "IN_PROGRESS";
  if (/^(TO_?TEST|A_?TESTER|TESTING|TEST|IN_?TEST)(_|$)/.test(v)) return "TO_TEST";
  if (/^(TO_?CHECK|A_?VERIFIER|CK|TO_?CLARIFY)(_|$)/.test(v)) return "TO_CHECK";
  if (/^(DONE|TERMINE|LIVRE|CLOS|CLOSED|FERME|MERGED?)(_|$)/.test(v)) return "DONE";
  if (/^(TODO|A_?FAIRE|BACKLOG|OPEN|NEW)(_|$)/.test(v)) return "TODO";
  if (/^(SUPERSEDED|SUPERSEDE|REMPLACE|OBSOLETE|CANCELLED|CANCELED|ANNULE|ABANDONNE|WONTFIX|WON_T_FIX|DUPLICATE)(_|$)/.test(v)) return "SUPERSEDED";
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

// Archived kanban rows (memory/archive/kanban.md). `@ailed-release` moves shipped DONE
// tickets there, so ignoring the file makes EPICs look ticket-less and understates the
// overall progress. Read as plain content, kept out of `entries` on purpose: it must not
// show up in the raw-file accordion nor in the staleness checks.
function readKanbanArchive(memDir) {
  const p = path.join(memDir, "archive", "kanban.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
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

// split a markdown table row into cells, honouring escaped pipes (`\|`) — memory tables
// routinely contain them inside code spans, and a naive split truncates those cells.
function tableCells(line) {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t.charAt(i);
    if (ch === "\\" && t.charAt(i + 1) === "|") { cur += "|"; i++; continue; }
    if (ch === "|") { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function isSeparatorRow(line) {
  return /^[-\s|]+$/.test(line.trim());
}

// parse the kanban markdown into { STATUS: [{id,title}] }, robust to extra tables/columns.
// `content` may concatenate memory/kanban.md and memory/archive/kanban.md: rows are
// de-duplicated by ticket ID (first occurrence wins) so archiving never double-counts.
function parseBoard(content) {
  const cols = {};
  for (const s of STATUSES) cols[s] = [];
  if (!content) return cols;
  let map = null;
  const seen = new Set();
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
    if (!st || !cols[st]) continue; // unknown status, or SUPERSEDED: out of the progress counters
    const id = (map.id >= 0 ? cs[map.id] : "").replace(/`/g, "").trim();
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    cols[st].push({ id, title: map.title >= 0 ? cs[map.title] : "" });
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

function statusTerminal(entries, memDirRel, style, archiveMd) {
  const kb = entries.find((e) => e.name === "kanban");
  const board = kb ? parseBoard(kb.content + "\n\n" + (archiveMd || "")) : null;
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

// ── Journal des tickets & captures d'écran (données hors mémoire) ───────────
// Le kanban ne porte qu'une date de création : l'historique réel des transitions est
// capté par le hook runtime dans `.ailed/journal.jsonl` (append-only, une ligne par
// changement de statut). Les captures de `/ailed-screens` vivent en PNG sur disque —
// jamais inlinées dans le rapport vivant, sinon il grossit de ~300 Ko par prise de vue.

const JOURNAL_MAX_LINES = 20000; // au-delà, on compacte le fichier sur disque
const JOURNAL_MAX_PER_TICKET = 40;

function journalPath(projectDir) { return path.join(projectDir, ".ailed", "journal.jsonl"); }

// .ailed/journal.jsonl → { ID: [{ts, from, to}] } en ordre chronologique.
// Les lignes illisibles sont ignorées : un journal à moitié écrit ne doit jamais
// faire échouer la génération du tableau de bord.
function readJournal(projectDir) {
  const p = journalPath(projectDir);
  let raw = "";
  try { raw = fs.readFileSync(p, "utf8"); } catch (_) { return { events: {}, lines: 0 }; }
  const lines = raw.split("\n").filter((l) => l.trim());
  const events = {};
  for (const l of lines) {
    let e;
    try { e = JSON.parse(l); } catch (_) { continue; }
    if (!e || !e.id || !e.to || !e.ts) continue;
    (events[e.id] = events[e.id] || []).push({ ts: e.ts, from: e.from || null, to: e.to });
  }
  // borne par ticket : on garde la première entrée dans chaque statut (c'est elle qui
  // date l'étape) puis les événements les plus récents pour les allers-retours.
  for (const id of Object.keys(events)) {
    const list = events[id];
    if (list.length <= JOURNAL_MAX_PER_TICKET) continue;
    const firsts = [], seen = new Set();
    for (const e of list) if (!seen.has(e.to)) { seen.add(e.to); firsts.push(e); }
    const tail = list.slice(-(JOURNAL_MAX_PER_TICKET - firsts.length));
    const keep = firsts.concat(tail.filter((e) => firsts.indexOf(e) < 0));
    events[id] = keep.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  }
  return { events, lines: lines.length };
}

// Réécrit le journal en ne gardant, par ticket, que la première entrée dans chaque
// statut et les 10 derniers événements. Appelé seulement au-delà du seuil : le fichier
// est de la télémétrie dérivée, pas de la mémoire — le borner est sans risque.
function compactJournal(projectDir, events) {
  const rows = [];
  for (const id of Object.keys(events)) {
    const list = events[id], seen = new Set(), keep = [];
    for (const e of list) if (!seen.has(e.to)) { seen.add(e.to); keep.push(e); }
    for (const e of list.slice(-10)) if (keep.indexOf(e) < 0) keep.push(e);
    keep.forEach((e) => rows.push({ ts: e.ts, id, from: e.from, to: e.to }));
  }
  rows.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  try {
    fs.writeFileSync(journalPath(projectDir), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  } catch (_) { return 0; }
  return rows.length;
}

const SHOT_VIEWPORTS = [["desktop", /desktop|wide|1280|1440|1920/i], ["mobile", /mobile|phone|iphone|390|375|428/i], ["tablet", /tablet|ipad|768|834/i]];

// Nom de fichier → libellés, quand meta.json est absent (capture faite à la main,
// ou skill interrompue avant l'écriture du manifeste).
function shotFromFilename(file) {
  const base = file.replace(/\.(png|jpe?g|webp)$/i, "");
  const vp = (SHOT_VIEWPORTS.find(([, re]) => re.test(base)) || [""])[0];
  const label = base.replace(/^\d+[-_]/, "").replace(/[-_](desktop|mobile|tablet|wide|phone|ipad)$/i, "").replace(/[-_]+/g, " ").trim();
  return { file, viewport: vp, state: label || base, reached: true };
}

// .ailed/screens/<TICKET>/<run>/ → dernière planche par ticket.
// `srcBase` est le préfixe relatif que le rapport utilisera (résolu depuis `.ailed/`).
function readScreens(projectDir) {
  const root = path.join(projectDir, ".ailed", "screens");
  const out = {};
  let bytes = 0, runs = 0;
  let tickets = [];
  try { tickets = fs.readdirSync(root); } catch (_) { return { screens: out, bytes: 0, runs: 0 }; }
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };
  for (const ticket of tickets) {
    const tdir = path.join(root, ticket);
    if (!isDir(tdir)) continue; // ignore les planches HTML historiques posées à plat
    const all = fs.readdirSync(tdir).filter((d) => isDir(path.join(tdir, d))).sort();
    if (!all.length) continue;
    runs += all.length;
    const run = all[all.length - 1]; // la plus récente fait foi
    const rdir = path.join(tdir, run);
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(rdir, "meta.json"), "utf8")) || {}; } catch (_) {}
    const pngs = fs.readdirSync(rdir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
    const declared = Array.isArray(meta.shots) ? meta.shots : [];
    const shots = (declared.length ? declared : pngs.map(shotFromFilename))
      .filter((s) => s && s.file && pngs.indexOf(s.file) >= 0)
      .map((s) => {
        let size = 0;
        try { size = fs.statSync(path.join(rdir, s.file)).size; } catch (_) {}
        bytes += size;
        return {
          src: ["screens", ticket, run, s.file].join("/"),
          abs: path.join(rdir, s.file),
          screen: s.screen || "", route: s.route || "", state: s.state || "",
          criterion: s.criterion || "", viewport: s.viewport || shotFromFilename(s.file).viewport,
          reached: s.reached !== false, bytes: size,
        };
      });
    if (!shots.length && !(meta.unreached || []).length) continue;
    out[ticket.toUpperCase()] = {
      run, capturedAt: meta.capturedAt || run, branch: meta.branch || "", baseUrl: meta.baseUrl || "",
      shots, unreached: Array.isArray(meta.unreached) ? meta.unreached.slice(0, 20) : [],
      console: Array.isArray(meta.console) ? meta.console.slice(0, 20) : [],
      olderRuns: all.length - 1,
    };
  }
  return { screens: out, bytes, runs };
}

function humanBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " Ko";
  return (n / 1024 / 1024).toFixed(1) + " Mo";
}

// Embed as JSON inside an inline <script>. Guard the three sequences that are
// valid in JSON but break an inline script: `</…` (closes the tag early) and the
// U+2028/U+2029 line separators (illegal in older JS string literals).
const safeJson = (v) => JSON.stringify(v)
  .replace(/<\//g, "<\\/")
  .replace(/[\u2028\u2029]/g, (m) => "\\u" + m.charCodeAt(0).toString(16));

// Construit la charge utile du tableau de bord. `stamp` en est l'empreinte : c'est
// elle que la page compare à chaque sondage pour décider s'il faut se redessiner.
function statusPayload(entries, style, archiveMd, projectDir, opts) {
  const j = readJournal(projectDir);
  if (j.lines > JOURNAL_MAX_LINES) compactJournal(projectDir, j.events);
  const sc = readScreens(projectDir);
  const screens = sc.screens;
  // Mode autonome : les PNG deviennent des data: URI pour que le fichier se partage
  // seul. C'est le seul mode où le poids des captures entre dans le rapport.
  if (opts && opts.inlineShots) {
    for (const t of Object.keys(screens)) {
      screens[t].shots = screens[t].shots.map((s) => {
        try {
          const ext = path.extname(s.abs).slice(1).toLowerCase();
          const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
          return Object.assign({}, s, { abs: undefined, src: `data:${mime};base64,` + fs.readFileSync(s.abs).toString("base64") });
        } catch (_) { return Object.assign({}, s, { abs: undefined, src: "", reached: false, missing: true }); }
      });
    }
  } else {
    for (const t of Object.keys(screens)) screens[t].shots = screens[t].shots.map((s) => Object.assign({}, s, { abs: undefined }));
  }
  const payload = {
    generated: new Date().toISOString().slice(0, 16).replace("T", " "),
    generatedAt: new Date().toISOString(),
    style: style || "standard",
    files: entries.map((e) => ({ name: e.name, file: e.file, title: e.title, date: e.date, age: e.age, content: e.content })),
    archive: { kanban: archiveMd || "" },
    journal: j.events,
    journalSince: (function () {
      try { return JSON.parse(fs.readFileSync(path.join(projectDir, ".ailed", "kanban-state.json"), "utf8")).since || null; }
      catch (_) { return null; }
    })(),
    screens,
  };
  // L'empreinte ignore `generated*` : sinon chaque sondage verrait un changement et la
  // page se redessinerait toutes les secondes pour rien.
  const stamp = sha256(safeJson(Object.assign({}, payload, { generated: "", generatedAt: "" }))).slice(0, 16);
  payload.stamp = stamp;
  return { payload, stats: { shotBytes: sc.bytes, runs: sc.runs, journalLines: j.lines } };
}

// Écrit `data.js` : une simple affectation de global, chargée par <script src>.
// Volontairement pas du JSON lu en fetch() — fetch est bloqué par CORS sur file://,
// une balise script non. C'est ce qui permet le rechargement à chaud sans serveur.
function writeStatusData(dataPath, payload) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, "window.__AILED__ = " + safeJson(payload) + ";\n");
}

// Chemin relatif utilisable dans une URL, depuis le dossier du rapport.
function relUrl(fromDir, target) {
  const r = path.relative(fromDir, target).split(path.sep).join("/");
  return r.startsWith(".") ? r : "./" + r;
}

function renderShell(outPath, dataSrc, ailedRoot, style, generated, inlineData) {
  // Charge utile : balise externe (rapport vivant, rechargeable) ou script inline
  // (instantané autonome). Une balise `src=""` ferait recharger le document lui-même,
  // d'où le choix d'injecter la balise entière plutôt qu'une URL vide.
  const dataTag = inlineData
    ? "<script>" + inlineData + "<\/script>"
    : (dataSrc ? '<script src="' + dataSrc + '"><\/script>' : "");
  fs.writeFileSync(
    outPath,
    // IMPORTANT: pass function replacements so `$`-sequences in the injected values
    // (`$&`, `$\``, `$'`, `$1`… — common in code/prices/apostrophes inside memory
    // content) are inserted literally instead of triggering replace's special patterns.
    HTML_TEMPLATE
      .replace("<!--__DATA_TAG__-->", () => dataTag)
      .replace(/__DATA_SRC__/g, () => dataSrc)
      .replace(/__AILED_ROOT__/g, () => ailedRoot)
      .replace(/__GENERATED__/g, () => generated)
      .replace(/__STYLE__/g, () => style || "standard")
  );
}

// Rapport vivant : coquille au chemin `outPath` + données dans `.ailed/status/data.js`.
function statusHtml(entries, outPath, style, archiveMd, projectDir) {
  const { payload, stats } = statusPayload(entries, style, archiveMd, projectDir, { inlineShots: false });
  const dataPath = path.join(projectDir, ".ailed", "status", "data.js");
  writeStatusData(dataPath, payload);
  const outDir = path.dirname(outPath);
  renderShell(outPath, relUrl(outDir, dataPath), relUrl(outDir, path.join(projectDir, ".ailed")) + "/", style, payload.generated, "");
  return { payload, stats, dataPath };
}

// Instantané autonome : tout dans un seul fichier, captures inlinées en base64.
// Destiné au partage et à l'archivage d'une revue, pas au suivi quotidien.
function statusSnapshot(entries, outPath, style, archiveMd, projectDir) {
  const { payload, stats } = statusPayload(entries, style, archiveMd, projectDir, { inlineShots: true });
  renderShell(outPath, "", "", style, payload.generated, "window.__AILED__ = " + safeJson(payload) + ";");
  return { payload, stats };
}

// Signature de l'état observable : mtime + taille des sources du tableau de bord.
// Un sondage (quelques dizaines de stat()) plutôt qu'un fs.watch : `recursive` n'est
// pas portable avant Node 20 et les watchers ratent les écritures atomiques (rename),
// exactement le motif d'un agent qui réécrit un fichier de mémoire.
function statusSignature(projectDir) {
  const parts = [];
  const stat = (p) => {
    try { const st = fs.statSync(p); return st.mtimeMs + ":" + st.size; } catch (_) { return "-"; }
  };
  const walk = (dir, depth) => {
    let names = [];
    try { names = fs.readdirSync(dir).sort(); } catch (_) { return; }
    for (const n of names) {
      const p = path.join(dir, n);
      let st;
      try { st = fs.statSync(p); } catch (_) { continue; }
      if (st.isDirectory()) { if (depth > 0) walk(p, depth - 1); }
      else parts.push(p + "=" + st.mtimeMs + ":" + st.size);
    }
  };
  walk(path.join(projectDir, "memory"), 1);
  parts.push("journal=" + stat(path.join(projectDir, ".ailed", "journal.jsonl")));
  walk(path.join(projectDir, ".ailed", "screens"), 2);
  return sha256(parts.join("|"));
}

function status() {
  const memDir = path.join(cwd, "memory");
  if (!fs.existsSync(memDir)) {
    console.error(`\n${c.yellow("memory/ introuvable")} dans ${cwd}.`);
    console.error(`Lance d'abord : ${c.cyan("npx @s2bp/ai-led-framework init")}\n`);
    process.exit(1);
  }
  const load = () => {
    const entries = readMemory(memDir);
    return { entries, archiveMd: readKanbanArchive(memDir) };
  };
  let { entries, archiveMd } = load();
  if (!entries.length) {
    console.error(`\n${c.yellow("Aucun fichier memory/*.md trouvé.")}\n`);
    process.exit(1);
  }
  // --style flag overrides the config value for this run; otherwise read memory/config.md
  const style = flag("style") ? canonStyle(flag("style")) : readStyle(entries);

  if (!argv.includes("--html")) { statusTerminal(entries, path.relative(cwd, memDir) || memDir, style, archiveMd); return; }

  // Instantané autonome et horodaté : un seul fichier, captures en base64, à partager
  // ou à archiver. C'est l'ancien comportement, désormais explicite.
  if (argv.includes("--snapshot")) {
    const d = new Date(), p2 = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const out = path.resolve(cwd, flag("out") || `${stamp}_ailed-status.html`);
    const { stats } = statusSnapshot(entries, out, style, archiveMd, cwd);
    const size = fs.statSync(out).size;
    console.log(`\n${c.green("✓")} Instantané autonome : ${c.cyan(path.relative(cwd, out) || out)} ${c.dim("(" + humanBytes(size) + ")")}`);
    if (stats.shotBytes) console.log(`  ${c.dim("dont " + humanBytes(stats.shotBytes) + " de captures inlinées — un seul fichier, partageable tel quel")}`);
    console.log(`  Ouvre-le dans un navigateur : ${c.dim("file://" + out)}\n`);
    return;
  }

  // Rapport vivant : nom stable (rechargeable / marque-page), données à côté.
  const out = path.resolve(cwd, flag("out") || "ailed-status.html");
  const emit = () => statusHtml(entries, out, style, archiveMd, cwd);
  const { stats, dataPath } = emit();
  const shellSize = fs.statSync(out).size, dataSize = fs.statSync(dataPath).size;
  console.log(`\n${c.green("✓")} Tableau de bord : ${c.cyan(path.relative(cwd, out) || out)} ${c.dim("(coquille " + humanBytes(shellSize) + " · données " + humanBytes(dataSize) + ")")}`);
  console.log(`  ${c.dim("données : " + (path.relative(cwd, dataPath) || dataPath) + " — rechargées à chaud, la page se redessine seule")}`);
  if (stats.runs) {
    console.log(`  ${c.dim("captures : " + humanBytes(stats.shotBytes) + " sur disque (" + stats.runs + " planche(s)), référencées et non inlinées")}`);
    if (stats.shotBytes > 200 * 1024 * 1024) {
      console.log(`  ${c.yellow("!")}    ${c.dim(".ailed/screens/ dépasse 200 Mo — `ai-led clean --screens` ne garde que la dernière planche par ticket")}`);
    }
  }
  console.log(`  Ouvre-le dans un navigateur : ${c.dim("file://" + out)}`);

  if (!argv.includes("--live")) {
    console.log(`  ${c.dim("Astuce : --live régénère les données à chaque changement de memory/ ; --snapshot produit un fichier autonome partageable.")}\n`);
    return;
  }

  const every = Math.max(250, parseInt(flag("interval") || "1000", 10) || 1000);
  console.log(`\n${c.bold("--live")} ${c.dim("· sondage " + every + " ms · Ctrl-C pour arrêter")}\n`);
  let sig = statusSignature(cwd);
  let n = 0;
  setInterval(() => {
    const next = statusSignature(cwd);
    if (next === sig) return;
    sig = next;
    try {
      const fresh = load();
      if (!fresh.entries.length) return; // écriture en cours : on retentera au prochain tour
      entries = fresh.entries; archiveMd = fresh.archiveMd;
      emit();
      n++;
      process.stdout.write(`\r${c.green("↻")} ${new Date().toTimeString().slice(0, 8)} — données régénérées (${n})   `);
    } catch (err) {
      process.stdout.write(`\r${c.yellow("!")} ${new Date().toTimeString().slice(0, 8)} — ${String(err.message).slice(0, 60)}   `);
    }
  }, every);
  // le timer référencé suffit à garder la boucle d'événements en vie ; surtout ne pas
  // l'unref (le process rendrait la main aussitôt après la première génération).
  process.on("SIGINT", () => {
    process.stdout.write(`\n${c.dim("--live arrêté · le rapport reste ouvrable, il ne se mettra plus à jour.")}\n`);
    process.exit(0);
  });
}

// ── clean : borne ce que le runtime laisse sur disque ───────────────────────
// `.ailed/` est dérivé et ignoré par git : on peut le tailler sans rien perdre. Les
// captures sont le seul poste qui grossit vraiment (~300 Ko la prise de vue), d'où une
// purge qui ne garde que la dernière planche par ticket.
function clean() {
  const dir = path.join(cwd, ".ailed");
  if (!fs.existsSync(dir)) { console.log(`\n${c.dim(".ailed/ absent — rien à nettoyer.")}\n`); return; }
  const all = !argv.includes("--screens") && !argv.includes("--journal");
  const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); return true; } catch (_) { return false; } };
  const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };
  let freed = 0, removed = 0;
  const sizeOf = (p) => {
    let n = 0;
    const walk = (q) => {
      let st; try { st = fs.statSync(q); } catch (_) { return; }
      if (!st.isDirectory()) { n += st.size; return; }
      let names = []; try { names = fs.readdirSync(q); } catch (_) { return; }
      names.forEach((x) => walk(path.join(q, x)));
    };
    walk(p); return n;
  };

  if (all || argv.includes("--screens")) {
    const root = path.join(dir, "screens");
    let tickets = []; try { tickets = fs.readdirSync(root); } catch (_) {}
    for (const t of tickets) {
      const tdir = path.join(root, t);
      if (!isDir(tdir)) continue;
      const runs = fs.readdirSync(tdir).filter((d) => isDir(path.join(tdir, d))).sort();
      for (const r of runs.slice(0, -1)) { // tout sauf la plus récente
        const p = path.join(tdir, r), s = sizeOf(p);
        if (rm(p)) { freed += s; removed++; }
      }
    }
    // planches HTML autonomes des versions antérieures (captures en base64)
    let flat = []; try { flat = fs.readdirSync(root).filter((f) => /\.html$/i.test(f)); } catch (_) {}
    for (const f of flat) { const p = path.join(root, f), s = sizeOf(p); if (rm(p)) { freed += s; removed++; } }
  }

  if (all || argv.includes("--journal")) {
    const j = readJournal(cwd);
    if (j.lines) {
      const before = sizeOf(journalPath(cwd));
      const kept = compactJournal(cwd, j.events);
      const after = sizeOf(journalPath(cwd));
      freed += Math.max(0, before - after);
      console.log(`  ${c.dim("journal compacté : " + j.lines + " → " + kept + " lignes")}`);
    }
  }

  console.log(`\n${c.green("✓")} ${removed} élément(s) supprimé(s) · ${humanBytes(freed)} libéré(s).`);
  console.log(`  ${c.dim("Conservé : la dernière planche de captures par ticket et l'historique compacté des tickets.")}\n`);
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
  .epic-timeline li:not(:last-child):after { content:""; position:absolute; top:17px; left:calc(50% + 20px); right:calc(-50% + 20px); height:2px; background:var(--border); }
  .epic-timeline li.done:not(:last-child):after { background:var(--ok); }
  /* le nœud est un camembert : un cercle vide ne dit pas où en est une EPIC en cours */
  .epic-timeline .node { position:relative; z-index:1; display:block; width:34px; height:34px; margin:0 auto 9px; line-height:0; border-radius:50%; }
  .epic-timeline li.current .node { box-shadow:0 0 0 4px rgba(110,168,254,.18); }
  .epic-timeline .ep-pct { display:block; text-align:center; font-size:10.5px; font-family:ui-monospace,monospace; color:var(--accent); margin-top:3px; }
  .epic-timeline li.done .ep-pct { color:var(--ok); }
  .epic-timeline .ep-pct.dim { color:var(--muted); opacity:.7; }
  .epic-timeline .ep-id { font-family:ui-monospace,monospace; font-size:11px; color:var(--muted); text-align:center; display:block; }
  .epic-timeline .ep-title { font-size:12.5px; text-align:center; display:block; line-height:1.35; }
  .epic-timeline li.current .ep-title { color:var(--accent); font-weight:600; }
  .epic-timeline li.todo { opacity:.65; }
  /* Kanban : une colonne par statut non-DONE + les DONE les plus récentes à droite */
  /* toutes les colonnes tiennent dans la largeur (minmax 0) ; défilement seulement en étroit */
  .kanban { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(0,1fr); gap:12px; align-items:start; padding:2px 2px 6px; }
  @media (max-width:900px){ .kanban { grid-auto-columns:minmax(178px,1fr); overflow-x:auto; } }
  .kcol { background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:12px 12px 4px; min-width:0; }
  .kcol > h4 { margin:0 0 10px; font-size:11.5px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); display:flex; align-items:center; gap:7px; }
  .kcol > h4 .kdot { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
  .kcol > h4 .kn { margin-left:auto; color:var(--text); background:var(--panel2); border:1px solid var(--border); border-radius:999px; padding:1px 8px; font-size:11px; font-variant-numeric:tabular-nums; }
  .kcol > h4 .kn.clickable { cursor:pointer; } .kcol > h4 .kn.clickable:hover { border-color:var(--accent); color:var(--accent); }
  .kcard { background:var(--panel2); border:1px solid var(--border); border-left:3px solid var(--cc); border-radius:8px; padding:8px 10px; margin-bottom:8px; cursor:pointer; }
  .kcard:hover { border-color:var(--accent); }
  .kcard span { display:block; overflow-wrap:anywhere; }
  .kcard .kms { font-size:10.5px; font-weight:700; letter-spacing:.04em; color:var(--warn); text-transform:uppercase; }
  .kcard .kep { font-size:10.5px; font-family:ui-monospace,monospace; color:var(--muted); }
  .kcard .kid { font-size:11px; font-family:ui-monospace,monospace; color:var(--accent); margin-top:2px; display:flex; align-items:center; gap:6px; }
  .kcard .kshot { color:var(--warn); font-size:10px; border:1px solid var(--border); border-radius:999px; padding:0 5px; }
  /* titres bornés à 4 lignes : les libellés de tickets peuvent faire un paragraphe entier,
     le détail complet est dans la popup de la carte */
  .kcard .ktt { font-size:13px; line-height:1.35; margin-top:2px; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:4; line-clamp:4; overflow:hidden; }
  .kcard .kraw { font-size:10.5px; color:var(--muted); font-style:italic; margin-top:3px; }
  .kcard.sup .ktt { text-decoration:line-through; color:var(--muted); }
  .kcol .kempty { color:var(--muted); font-style:italic; font-size:12.5px; padding:0 2px 10px; }
  .kmore { display:block; width:100%; background:none; border:1px dashed var(--border); color:var(--muted); border-radius:8px; padding:6px; font-size:12px; cursor:pointer; margin-bottom:8px; }
  .kmore:hover { border-color:var(--accent); color:var(--accent); }
  /* markdown allégé (leds, popups) — rendu hors ligne, sans dépendance */
  .mdlite p { margin:0 0 10px; } .mdlite ul, .mdlite ol { margin:0 0 10px; padding-left:20px; }
  .mdlite li { margin:2px 0; } .mdlite > :last-child { margin-bottom:0; }
  .mdlite h5 { margin:16px 0 7px; font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--accent); }
  .mdlite code, .lede code, .modal-table code, .inc code { background:var(--panel2); padding:1px 5px; border-radius:4px; font-size:12.5px; }
  .kcard code { background:rgba(255,255,255,.06); border-radius:3px; padding:0 3px; font-size:12px; }
  .kcard strong, .modal-table strong { color:var(--text); font-weight:600; }
  .mdlite .strike, .lede .strike { text-decoration:line-through; color:var(--muted); }
  .lede strong, .mdlite strong { color:var(--text); }
  .lede .more { background:none; border:none; color:var(--accent); cursor:pointer; font-size:13px; padding:0; text-decoration:underline; white-space:nowrap; }
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
  /* indicateur de rechargement à chaud */
  header .live { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ok); border:1px solid rgba(108,192,112,.4); background:rgba(108,192,112,.12); border-radius:999px; padding:2px 9px 2px 18px; cursor:pointer; position:relative; user-select:none; }
  header .live:before { content:""; position:absolute; left:8px; top:50%; width:6px; height:6px; margin-top:-3px; border-radius:50%; background:var(--ok); animation:pulse 2s ease-in-out infinite; }
  header .live.paused { color:var(--muted); border-color:var(--border); background:var(--panel); }
  header .live.paused:before { background:var(--muted); animation:none; }
  header .live.off { color:var(--danger); border-color:var(--danger); background:transparent; }
  header .live.off:before { background:var(--danger); animation:none; }
  @keyframes pulse { 0%,100%{ opacity:1; } 50%{ opacity:.25; } }
  @media (prefers-reduced-motion:reduce){ header .live:before { animation:none; } }
  /* historique d'un ticket (popup) */
  .hist { list-style:none; margin:0 0 8px; padding:0; }
  .hist li { display:grid; grid-template-columns:14px 1fr auto auto; align-items:baseline; gap:10px; padding:5px 0; border-bottom:1px solid var(--border); font-size:13px; }
  .hist li:last-child { border-bottom:0; }
  .hist .hdot { width:9px; height:9px; border-radius:50%; align-self:center; }
  .hist .hlab { color:var(--text); }
  .hist .hts { font-family:ui-monospace,monospace; font-size:12px; color:var(--muted); }
  .hist .hts i { font-style:normal; opacity:.6; }
  .hist .hgap { font-size:11.5px; color:var(--accent); min-width:64px; text-align:right; }
  .hist li.miss .hlab { color:var(--muted); }
  .hfoot { font-size:12px; color:var(--muted); margin:0 0 4px; } .hfoot.dim { opacity:.75; font-style:italic; }
  .hfoot b { color:var(--text); }
  /* captures d'écran rattachées au ticket (popup) */
  .mgrp-sub { font-weight:400; text-transform:none; letter-spacing:0; color:var(--muted); font-size:11.5px; }
  .shotgrp { margin:0 0 16px; }
  .shotgrp figcaption { display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; font-size:12.5px; color:var(--muted); margin-bottom:6px; }
  .shotgrp figcaption b { color:var(--text); }
  .shotgrp figcaption .st { color:var(--warn); }
  .shotgrp figcaption .crit { border:1px solid var(--border); border-radius:999px; padding:1px 7px; font-size:11px; }
  .shots { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-start; }
  .shot { position:relative; display:block; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--panel2); line-height:0; max-width:100%; }
  .shot:hover { border-color:var(--accent); }
  .shot img { display:block; width:auto; height:auto; max-width:min(100%,340px); max-height:300px; }
  .shot .vp { position:absolute; left:6px; bottom:6px; background:rgba(15,17,23,.82); color:var(--text); font-size:10.5px; border-radius:4px; padding:1px 6px; line-height:1.5; }
  .unreach { margin:6px 0 0; padding-left:18px; color:var(--warn); font-size:12.5px; }
  .conslog { margin-top:8px; font-size:12px; color:var(--muted); }
  .conslog ul { margin:6px 0 0; padding-left:18px; } .conslog li { overflow-wrap:anywhere; }
  /* capture en grand */
  .lightbox { position:fixed; inset:0; z-index:60; background:rgba(8,9,12,.92); display:flex; align-items:center; justify-content:center; padding:24px; cursor:zoom-out; }
  /* display:flex l'emporterait sur le [hidden] du navigateur : on le neutralise */
  .lightbox[hidden] { display:none; }
  .lightbox img { max-width:100%; max-height:100%; border-radius:8px; box-shadow:0 12px 48px rgba(0,0,0,.6); }
</style>
</head>
<body>
<header>
  <h1>AI-Led — Dashboard</h1>
  <span class="gen" id="gen">generated on __GENERATED__ · read-only</span>
  <span class="live" id="live" role="button" tabindex="0" title="live reload — click to pause">live</span>
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
<div id="lightbox" class="lightbox" hidden><img alt="captured screen"></div>
<!--__DATA_TAG__-->
<script>
  // Charge utile : soit déjà présente (instantané autonome, --snapshot), soit chargée
  // juste avant par <script src="…/data.js"> — jamais par fetch(), bloqué par CORS en
  // file://. C'est ce choix qui rend le rechargement à chaud possible sans serveur.
  var DATA_SRC = "__DATA_SRC__";
  var AILED_ROOT = "__AILED_ROOT__";
  var PAYLOAD = window.__AILED__ || { files:[], archive:{kanban:''}, style:"__STYLE__", journal:{}, screens:{}, generated:"__GENERATED__", stamp:'' };
  var DATA = PAYLOAD.files || [];
  var ARCHIVE = PAYLOAD.archive || { kanban:'' };
  var STYLE = PAYLOAD.style || "__STYLE__";
  var SCREENS = PAYLOAD.screens || {};
  var JOURNAL = PAYLOAD.journal || {};
  var JOURNAL_SINCE = PAYLOAD.journalSince || null;
  // statuts comptés dans l'avancement (ordre de workflow)
  var STATUSES = ['TO_CHECK','TODO','IN_PROGRESS','TO_TEST','DONE'];
  // statuts hors avancement, affichés sur le board seulement s'ils existent :
  // SUPERSEDED = travail annulé/remplacé, OTHER = statut hors référentiel (affiché tel quel)
  var OFF_BOARD = ['SUPERSEDED','OTHER'];
  var LABEL = {TO_CHECK:'To check',TODO:'To do',IN_PROGRESS:'In progress',TO_TEST:'To test',DONE:'Done',SUPERSEDED:'Superseded',OTHER:'Other'};
  function staleLimit(name){ return name === 'market-watch' ? 30 : 60; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function get(name){ return DATA.filter(function(e){ return e.name===name; })[0]; }
  // découpe une ligne de table markdown en cellules, en respectant les pipes échappés
  // (fréquents dans les code spans de la mémoire : un split naïf tronque la cellule)
  function cells(line){
    var t=String(line).trim().replace(/^\\|/,'').replace(/\\|$/,''), out=[], cur='', BS=String.fromCharCode(92);
    for(var i=0;i<t.length;i++){
      var ch=t.charAt(i);
      if(ch===BS && t.charAt(i+1)==='|'){ cur+='|'; i++; continue; }
      if(ch==='|'){ out.push(cur.trim()); cur=''; continue; }
      cur+=ch;
    }
    out.push(cur.trim());
    return out;
  }
  function isSep(line){ return /^[-\\s|]+$/.test(line.trim()); }

  // ── markdown minimal → HTML sûr (hors ligne, sans dépendance CDN) ──────────
  // Le rapport doit rester présentable même quand la mémoire contient du markdown
  // dense (gras, backticks, listes, tables) : on rend, on n'affiche jamais la source.
  function mdInline(s){
    var t=esc(String(s||''));
    t=t.replace(/\`([^\`]+)\`/g, function(_,c){ return '<code>'+c+'</code>'; });
    t=t.replace(/\\*\\*([^*]+)\\*\\*/g, function(_,c){ return '<strong>'+c+'</strong>'; });
    t=t.replace(/~~([^~]+)~~/g, function(_,c){ return '<span class="strike">'+c+'</span>'; });
    t=t.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, function(_,txt,href){
      return /^https?:/.test(href) ? '<a href="'+href.replace(/"/g,'%22')+'" rel="noopener">'+txt+'</a>' : txt; });
    // marqueurs orphelins (paire coupée par une troncature ou une cellule mal fermée) :
    // on les retire — le rapport ne doit jamais afficher de balisage brut.
    return t.replace(/\`/g,'').replace(/\\*\\*/g,'');
  }
  // markdown → blocs (paragraphes, listes, titres, tables). Utilisé dans les popups.
  function mdBlocks(md){
    var out='', para=[], list=null, tbl=null;
    function flushP(){ if(para.length){ out+='<p>'+mdInline(para.join(' '))+'</p>'; para=[]; } }
    function flushL(){ if(list){ out+='<'+list.tag+'>'+list.items.map(function(x){ return '<li>'+mdInline(x)+'</li>'; }).join('')+'</'+list.tag+'>'; list=null; } }
    function flushT(){ if(tbl){ out+='<table class="modal-table"><thead><tr>'+tbl.head.map(function(h){ return '<th>'+mdInline(h)+'</th>'; }).join('')+'</tr></thead><tbody>'
      + tbl.rows.map(function(r){ return '<tr>'+r.map(function(x){ return '<td>'+mdInline(x)+'</td>'; }).join('')+'</tr>'; }).join('')+'</tbody></table>'; tbl=null; } }
    function flush(){ flushP(); flushL(); flushT(); }
    String(md||'').split('\\n').forEach(function(l){
      var t=l.trim();
      if(!t){ flush(); return; }
      if(t.charAt(0)==='|'){ flushP(); flushL(); if(isSep(l)) return; var cs=cells(l); if(!tbl) tbl={head:cs,rows:[]}; else tbl.rows.push(cs); return; }
      flushT();
      var h=t.match(/^#{1,6}\\s+(.*)$/);
      if(h){ flush(); out+='<h5>'+mdInline(h[1])+'</h5>'; return; }
      var li=t.match(/^([-*•]|\\d+[.)])\\s+(.*)$/);
      if(li){ flushP(); var tag=/^\\d/.test(li[1])?'ol':'ul';
        if(!list||list.tag!==tag){ flushL(); list={tag:tag,items:[]}; }
        list.items.push(li[2]); return; }
      if(list){ list.items[list.items.length-1]+=' '+t; return; }
      para.push(t);
    });
    flush();
    return out;
  }
  // markdown → texte brut (pour le chapô : jamais de balisage résiduel à l'écran)
  function mdPlain(s){
    return String(s||'')
      .replace(/\`([^\`]+)\`/g, function(_,c){ return c; })
      .replace(/\\[([^\\]]+)\\]\\([^)]*\\)/g, function(_,c){ return c; })
      .replace(/~~/g,'').replace(/\\*+/g,'')
      .replace(/^#{1,6}\\s+/,'').replace(/^>\\s*/,'')
      .replace(/\\s+/g,' ').trim();
  }
  // coupe proprement sur un mot, sans jamais laisser de balisage ouvert
  function clampText(s, n){
    if(s.length<=n) return s;
    var cut=s.slice(0,n), sp=cut.lastIndexOf(' ');
    if(sp > n*0.6) cut=cut.slice(0,sp);
    return cut.replace(/[\\s,;:.\\-–—(]+$/,'')+'…';
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
  // « ## État actuel » de project-state.md → { first: 1er paragraphe, full: section entière }.
  // Cette section grossit avec le projet (listes, tables, gras) : le chapô n'en garde que le
  // 1er paragraphe, en texte brut et borné ; l'intégralité part dans une popup rendue.
  function stateSection(md){
    if(!md) return null; var lines=md.split('\\n'), grab=false, buf=[];
    for(var i=0;i<lines.length;i++){
      var l=lines[i];
      if(/^##\\s/.test(l)){ if(grab) break; grab=/^##\\s+(État actuel|Etat actuel|Current state)/i.test(l); continue; }
      if(grab) buf.push(l);
    }
    while(buf.length && !buf[0].trim()) buf.shift();
    while(buf.length && !buf[buf.length-1].trim()) buf.pop();
    if(!buf.length) return null;
    var first=[];
    for(var j=0;j<buf.length;j++){ if(!buf[j].trim()) break; first.push(buf[j].trim()); }
    var f=mdPlain(first.join(' '));
    if(!f || /^TO IDENTIFY/i.test(f)) return null;
    return { first:f, full:buf.join('\\n'), more:buf.length>first.length };
  }
  var SCOL={TO_CHECK:'#c08be8',TODO:'#8b929e',IN_PROGRESS:'#6ea8fe',TO_TEST:'#f0c674',DONE:'#6cc070',SUPERSEDED:'#6b7280',OTHER:'#6b7280'};
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
  // canonical status, tolerant to backticks / case / accents / FR-EN wording, and to a
  // trailing qualifier ('DONE (PR #118, mergé develop)' → DONE). null = hors référentiel.
  function normStatus(raw){
    var v=String(raw||'').replace(/\`/g,'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toUpperCase().replace(/[\\s\\-–—]+/g,'_');
    v=v.split('(')[0].replace(/^_+|_+$/g,'');
    if(!v) return null;
    if(STATUSES.indexOf(v)>=0) return v;
    if(/^(IN_?PROGRESS|EN_?COURS|WIP|DOING|ONGOING)(_|$)/.test(v)) return 'IN_PROGRESS';
    if(/^(TO_?TEST|A_?TESTER|TESTING|TEST|IN_?TEST)(_|$)/.test(v)) return 'TO_TEST';
    if(/^(TO_?CHECK|A_?VERIFIER|CK|TO_?CLARIFY)(_|$)/.test(v)) return 'TO_CHECK';
    if(/^(DONE|TERMINE|LIVRE|CLOS|CLOSED|FERME|MERGED?)(_|$)/.test(v)) return 'DONE';
    if(/^(TODO|A_?FAIRE|BACKLOG|OPEN|NEW)(_|$)/.test(v)) return 'TODO';
    if(/^(SUPERSEDED|SUPERSEDE|REMPLACE|OBSOLETE|CANCELLED|CANCELED|ANNULE|ABANDONNE|WONTFIX|WON_T_FIX|DUPLICATE)(_|$)/.test(v)) return 'SUPERSEDED';
    return null;
  }
  // mot entier présent dans une chaîne (sans regex : évite tout échappement)
  function hasToken(hay, tok){
    var H=String(hay||'').toUpperCase(), T=String(tok||'').toUpperCase(); if(!T) return false;
    for(var i=H.indexOf(T); i>=0; i=H.indexOf(T,i+1)){
      var b=i>0?H.charAt(i-1):'', a=H.charAt(i+T.length);
      if(!/[A-Z0-9]/.test(b) && !/[A-Z0-9]/.test(a)) return true;
    }
    return false;
  }
  // cellule EPIC d'un ticket → identifiants d'EPIC. Tolère les backticks, le texte libre,
  // les rattachements multiples ('EPIC-1/2/3') et les cellules décalées (rien de reconnu → []).
  function extractEpics(cell, ids){
    var s=String(cell||'').replace(/\`/g,'').trim();
    if(!s || s==='—' || s==='-') return [];
    var m=s.match(/^([A-Za-z]+)[-_\\s]?(\\d+(?:\\s*\\/\\s*\\d+)+)$/);
    if(m) return m[2].split('/').map(function(x){ return (m[1]+'-'+x.trim()).toUpperCase(); });
    var out=[];
    (ids||[]).forEach(function(id){ if(hasToken(s,id) && out.indexOf(id.toUpperCase())<0) out.push(id.toUpperCase()); });
    if(!out.length){
      (s.match(/EPIC-?\\d+/gi)||[]).forEach(function(x){
        var v=x.toUpperCase().replace(/^EPIC-?/,'EPIC-'); if(out.indexOf(v)<0) out.push(v);
      });
    }
    return out;
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
  // kanban.md → [{id,title,status,raw,epics,epic,desc,date,num,seq,archived}]
  // ids = EPICs déclarées dans epics.md (résolution de la colonne EPIC).
  // seqBase ordonne les lignes entre fichiers (archive avant kanban vivant).
  function parseKanbanFull(md, ids, seqBase, archived){
    var out=[]; if(!md) return out; var map=null, n=0;
    md.split('\\n').forEach(function(line){
      if(line.trim().charAt(0)!=='|'){ map=null; return; }
      var cs=cells(line), lo=cs.map(function(c){ return c.toLowerCase(); });
      if(lo.indexOf('status')>=0 && (lo.indexOf('titre')>=0||lo.indexOf('title')>=0)){
        map={ status:lo.indexOf('status'), title:lo.indexOf('titre')>=0?lo.indexOf('titre'):lo.indexOf('title'), id:lo.indexOf('id'), epic:lo.indexOf('epic'),
              desc:lo.findIndex(function(c){ return /description/.test(c); }), date:lo.findIndex(function(c){ return /date/.test(c); }) };
        return;
      }
      if(isSep(line)||!map) return;
      var rawSt=String(map.status>=0?cs[map.status]:'').replace(/\`/g,'').trim();
      var id=String(map.id>=0?cs[map.id]:'').replace(/\`/g,'').trim();
      var title=map.title>=0?cs[map.title]:'';
      if(!rawSt || rawSt==='—' || (!id && !title)) return; // ligne de gabarit / cellule vide
      var digits=id.match(/\\d+/g);
      var eps=extractEpics(map.epic>=0?cs[map.epic]:'', ids);
      out.push({ id:id, title:title, status:normStatus(rawSt)||'OTHER', raw:rawSt,
        epics:eps, epic:eps[0]||'', desc:map.desc>=0?cs[map.desc]:'', date:map.date>=0?cs[map.date]:'',
        num:digits?parseInt(digits[digits.length-1],10):0, seq:(seqBase||0)+(n++), archived:!!archived });
    });
    return out;
  }
  // statut effectif d'une epic : dérivé de ses tickets, sinon valeur du fichier.
  // Les tickets hors avancement (SUPERSEDED / statut inconnu) sont neutres : une EPIC
  // dont tout le travail vivant est DONE reste 'done' même si elle traîne des remplacés.
  function epicEff(epic, tickets){
    var up=String(epic.id||'').toUpperCase();
    var ts=tickets.filter(function(t){ return t.epics.indexOf(up)>=0 && STATUSES.indexOf(t.status)>=0; });
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
  function milestoneProgress(miles, epics, tickets){
    var cur=miles.filter(function(m){ return !m.delivered; })[0] || miles[miles.length-1];
    if(!cur) return null;
    var done=0, total=0;
    if(cur.epics.length){
      var tk=tickets.filter(function(t){ return STATUSES.indexOf(t.status)>=0 && t.epics.some(function(e){ return cur.epics.indexOf(e)>=0; }); });
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
  // Dernière popup ouverte, rejouée après un rechargement à chaud : on ne ferme pas
  // la fenêtre que l'humain était en train de lire parce que la mémoire a bougé.
  var lastModal=null;
  function openModal(title, count, html){
    if(!modalEl) modalEl=document.getElementById('modal');
    document.getElementById('modalTitle').textContent=mdPlain(title);
    document.getElementById('modalCount').textContent=count||'';
    document.getElementById('modalBody').innerHTML=html||'';
    modalEl.hidden=false;
  }
  function closeModal(){ if(modalEl) modalEl.hidden=true; lastModal=null; }
  // colored status pill
  function badge(st){ var col=SCOL[st]||'#8b929e'; return '<span class="badge-st" style="background:'+col+'22;color:'+col+';border:1px solid '+col+'66">'+(LABEL[st]||st)+'</span>'; }
  // statut affiché : pastille pour les statuts du référentiel, libellé brut sinon
  function stCell(t){ return t.status==='OTHER' ? '<span class="badge-st" style="color:var(--muted);border:1px solid var(--border)">'+esc(t.raw||'—')+'</span>' : badge(t.status); }
  // table of tickets (id / title / [epic] / status)
  function taskTable(list, withEpic){
    if(!list.length) return '<p class="modal-empty">No matching task.</p>';
    return '<table class="modal-table"><thead><tr><th>ID</th><th>Title</th>'+(withEpic?'<th>EPIC</th>':'')+'<th>Status</th></tr></thead><tbody>'
      + list.map(function(t){ return '<tr><td class="mono">'+esc(t.id||'—')+'</td><td>'+mdInline(t.title||'(untitled)')+'</td>'
          +(withEpic?'<td class="mono">'+esc((t.epics||[]).join(' ')||'—')+'</td>':'')+'<td>'+stCell(t)+'</td></tr>'; }).join('')
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
        html+='<h4 class="mgrp">'+mdInline(cur)+'</h4><table class="modal-table"><thead><tr>'
          + head.map(function(h){ return '<th>'+mdInline(h)+'</th>'; }).join('')+'</tr></thead><tbody>'
          + rows.map(function(r){ return '<tr>'+r.map(function(c,i){ return '<td'+(i===0?' class="mono"':'')+'>'+(i===0?esc(mdPlain(c)):mdInline(c))+'</td>'; }).join('')+'</tr>'; }).join('')
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
  // tickets rattachés à une EPIC (rattachements multiples inclus)
  function ticketsOf(id){ var up=String(id||'').toUpperCase(); return tickets.filter(function(t){ return t.epics.indexOf(up)>=0; }); }
  // bloc '### EPIC-n — …' de epics.md : sert de repli quand aucun ticket n'est rattaché
  function epicBrief(id){
    var md=(get('epics')||{}).content; if(!md) return '';
    var lines=md.split('\\n'), grab=false, buf=[], up=String(id||'').toUpperCase();
    for(var i=0;i<lines.length;i++){
      var h=lines[i].match(/^#{2,4}\\s+(.*)$/);
      if(h){ if(grab) break; grab=h[1].replace(/\`/g,'').trim().toUpperCase().indexOf(up)===0; continue; }
      if(grab) buf.push(lines[i]);
    }
    while(buf.length && !buf[buf.length-1].trim()) buf.pop();
    return buf.length? mdBlocks(buf.join('\\n')) : '';
  }
  // popup openers
  function openStatus(st){
    lastModal=function(){ openStatus(st); };
    var l=tickets.filter(function(t){ return t.status===st; }).sort(recent);
    openModal((LABEL[st]||st)+' — tasks', l.length+' ticket'+(l.length===1?'':'s'), taskTable(l,true));
  }
  function openEpic(id){
    lastModal=function(){ openEpic(id); };
    var l=ticketsOf(id).sort(recent);
    var ep=epics.filter(function(e){ return e.id.toUpperCase()===String(id||'').toUpperCase(); })[0];
    var brief=epicBrief(id), body;
    if(l.length){
      body=taskTable(l,false)+(brief? '<h4 class="mgrp">EPIC definition</h4><div class="mdlite">'+brief+'</div>':'');
    } else {
      // aucun ticket rattaché (EPIC portée par une SPEC, tickets non découpés, ou colonne
      // EPIC non renseignée) : on montre sa définition plutôt qu'une popup vide.
      body=(brief? '<p class="modal-empty">No ticket linked to this EPIC in <code>memory/kanban.md</code> (nor in the archive) — showing its definition from <code>memory/epics.md</code>.</p><div class="mdlite">'+brief+'</div>'
                 : '<p class="modal-empty">No ticket linked to this EPIC, and no definition found in <code>memory/epics.md</code>.</p>');
    }
    openModal((ep&&ep.title? id+' — '+ep.title : id), l.length+' task'+(l.length===1?'':'s'), body);
  }
  // détail d'un ticket (carte du kanban)
  function openTicket(id){
    lastModal=function(){ openTicket(id); };
    var t=tickets.filter(function(x){ return x.id===id; })[0];
    // le ticket a disparu du kanban entre deux rendus (renommé, archivé, supprimé) :
    // fermer plutôt que laisser à l'écran un détail qui ne correspond plus à rien
    if(!t){ closeModal(); return; }
    var m=ticketMilestone(t);
    var rows=[['Milestone', m? esc(mdPlain(m.name)):'—'],
              ['EPIC', esc((t.epics||[]).join(', ')||'—')],
              ['Status', stCell(t)],
              ['Created', esc(t.date||'—')],
              ['Source', t.archived? '<code>memory/archive/kanban.md</code>':'<code>memory/kanban.md</code>']];
    var sc=SCREENS[String(t.id||'').toUpperCase()];
    openModal((t.id||'Task')+(t.title? ' — '+t.title:''), sc? (sc.shots||[]).length+' screen(s)':'',
      '<table class="modal-table"><tbody>'+rows.map(function(r){ return '<tr><th style="width:120px">'+r[0]+'</th><td>'+r[1]+'</td></tr>'; }).join('')+'</tbody></table>'
      + (t.desc? '<h4 class="mgrp">Description</h4><div class="mdlite">'+mdBlocks(t.desc)+'</div>':'')
      + historyBlock(t)
      + screensBlock(t));
  }
  // « État actuel » complet, rendu (le chapô n'en affiche qu'un extrait borné)
  function openState(){
    lastModal=openState;
    var s=stateSection((get('project-state')||{}).content);
    openModal('Project state', 'memory/project-state.md — current state',
      s? '<div class="mdlite">'+mdBlocks(s.full)+'</div>' : '<p class="modal-empty">Nothing recorded yet.</p>');
  }
  function openIncidents(){
    lastModal=openIncidents;
    var l=listIncidents((get('incidents')||{}).content);
    var b=l.length? l.map(function(i){ return '<div class="inc"><div class="inc-h"><span class="mono">'+esc(i.id)+'</span>'+mdInline(i.title)+'</div>'
      +(i.fields.length?'<ul>'+i.fields.map(function(f){ return '<li>'+mdInline(f)+'</li>'; }).join('')+'</ul>':'')+'</div>'; }).join('')
      : '<p class="modal-empty">No open incident.</p>';
    openModal('Bugs to handle', l.length+' incident'+(l.length===1?'':'s'), b);
  }
  function openVulns(){
    lastModal=openVulns;
    var l=listVulns((get('security')||{}).content);
    var b=l.length? '<table class="modal-table"><thead><tr><th>ID</th><th>Severity</th><th>Component</th><th>Real risk</th><th>Status</th></tr></thead><tbody>'
      + l.map(function(v){ return '<tr><td class="mono">'+esc(v.id)+'</td><td>'+sevBadge(v.sev)+'</td><td>'+mdInline(v.comp||'—')+'</td><td>'+mdInline(v.risk||'—')+'</td><td>'+mdInline(v.status||'—')+'</td></tr>'; }).join('')
      + '</tbody></table>' : '<p class="modal-empty">No open vulnerability.</p>';
    openModal('Open vulnerabilities', l.length+' item'+(l.length===1?'':'s'), b);
  }
  function openCandidates(){
    lastModal=openCandidates;
    var l=listCandidates((get('market-watch')||{}).content);
    var b=l.length? '<table class="modal-table"><thead><tr><th>ID</th><th>Topic</th><th>Value hypothesis</th><th>Impact</th><th>Effort</th></tr></thead><tbody>'
      + l.map(function(x){ return '<tr><td class="mono">'+esc(x.id)+'</td><td>'+mdInline(x.topic||'—')+'</td><td>'+mdInline(x.hyp||'—')+'</td><td>'+mdInline(x.impact||'—')+'</td><td>'+mdInline(x.effort||'—')+'</td></tr>'; }).join('')
      + '</tbody></table>' : '<p class="modal-empty">No pending arbitration.</p>';
    openModal('Product arbitrations', l.length+' topic'+(l.length===1?'':'s'), b);
  }
  function openFeatures(){
    lastModal=openFeatures;
    openModal('Feature inventory', 'delivery / release info in the Notes column',
      sectionsWithTables((get('features')||{}).content) || '<p class="modal-empty">No feature recorded yet.</p>');
  }

  // ── Secteur de camembert (partagé timeline / donuts) ──────
  function sector(cx,cy,r,frac,fill){
    if(!(frac>0)) return '';
    if(frac>=0.9999) return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'"/>';
    var a=-Math.PI/2, a2=a+frac*2*Math.PI;
    var x1=cx+r*Math.cos(a), y1=cy+r*Math.sin(a), x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
    return '<path d="M'+cx+' '+cy+' L'+x1.toFixed(2)+' '+y1.toFixed(2)+' A'+r+' '+r+' 0 '+(frac>0.5?1:0)+' 1 '+x2.toFixed(2)+' '+y2.toFixed(2)+' Z" fill="'+fill+'"/>';
  }
  // Nœud de la timeline : un cercle vide ne dit pas où en est une EPIC en cours,
  // un secteur rempli si. Le % vient des tickets rattachés, jamais du fichier.
  function nodePie(eff, prog){
    var frac = prog ? prog.pct/100 : (eff==='done' ? 1 : 0);
    var col = eff==='done' ? 'var(--ok)' : eff==='current' ? 'var(--accent)' : 'var(--muted)';
    var ring = eff==='current' ? 'var(--accent)' : 'var(--border)';
    var inner = eff==='done' && frac>=0.9999
      ? '<path d="M11.5 17.5l4 4 7.5-7.5" fill="none" stroke="#06240a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
      : (!prog && eff!=='done' ? '<circle cx="17" cy="17" r="2.4" fill="var(--muted)"/>' : '');
    return '<span class="node ' + eff + '"><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">'
      + '<circle cx="17" cy="17" r="15" fill="var(--panel2)"/>'
      + sector(17,17,15,frac,col)
      + '<circle cx="17" cy="17" r="15" fill="none" stroke="'+ring+'" stroke-width="2"/>'
      + inner + '</svg></span>';
  }
  // avancement d'une EPIC : part de ses tickets DONE. null = aucun ticket rattaché,
  // auquel cas on n'affiche pas de pourcentage plutôt que d'en inventer un.
  function epicProgress(id){
    var ts=ticketsOf(id).filter(function(t){ return STATUSES.indexOf(t.status)>=0; });
    if(!ts.length) return null;
    var d=ts.filter(function(t){ return t.status==='DONE'; }).length;
    return { pct:Math.round(d/ts.length*100), done:d, total:ts.length };
  }

  // ── Historique d'un ticket ────────────────────────────────
  // La date de création vient de la colonne « Date création » du kanban ; les autres
  // étapes viennent de .ailed/journal.jsonl, alimenté par le hook runtime à chaque
  // écriture du kanban. Une étape antérieure à l'installation du journal est affichée
  // comme non datée — jamais devinée.
  var STEP_LABEL={TO_CHECK:'Clarification asked',TODO:'Created',IN_PROGRESS:'Development started',TO_TEST:'Handed to test',DONE:'Finalised',SUPERSEDED:'Superseded'};
  function fmtTs(ts){
    if(!ts) return '';
    if(/^\\d{4}-\\d{2}-\\d{2}T/.test(ts)){ var d=new Date(ts); if(!isNaN(d)) return ts.slice(0,10)+' '+ts.slice(11,16); }
    return String(ts);
  }
  function fmtDur(ms){
    if(!(ms>0)) return '';
    var m=Math.round(ms/60000);
    if(m<60) return m+' min';
    var h=Math.floor(m/60); if(h<24) return h+' h'+(m%60?' '+(m%60)+' min':'');
    var d=Math.floor(h/24); return d+' d'+(h%24?' '+(h%24)+' h':'');
  }
  function tsMs(ts){ var d=new Date(ts); return isNaN(d)?null:d.getTime(); }
  // chaîne d'étapes : première entrée dans chaque statut, dans l'ordre chronologique
  function ticketSteps(t){
    var ev=JOURNAL[t.id]||[], first=[], seen={};
    ev.forEach(function(e){ if(!seen[e.to]){ seen[e.to]=1; first.push({ status:e.to, ts:e.ts }); } });
    // création : la colonne du kanban fait foi, le journal ne sert que de repli
    var created=t.date && t.date!=='—' ? t.date : (first.length? first[0].ts : '');
    var steps=[{ status:'CREATED', label:'Created', ts:created, src:'memory/kanban.md' }];
    first.forEach(function(f){
      if(f.status==='TODO' && steps.length===1 && created) return; // doublon avec la création
      steps.push({ status:f.status, label:STEP_LABEL[f.status]||f.status, ts:f.ts, src:'journal' });
    });
    // étapes du workflow jamais enregistrées : on les montre vides plutôt que de les taire
    ['IN_PROGRESS','TO_TEST','DONE'].forEach(function(st){
      var reached=STATUSES.indexOf(t.status)>=STATUSES.indexOf(st);
      if(!reached || seen[st]) return;
      steps.push({ status:st, label:STEP_LABEL[st], ts:'', src:'', missing:true });
    });
    return steps;
  }
  function historyBlock(t){
    var steps=ticketSteps(t), prev=null;
    var rows=steps.map(function(s){
      var ms=s.ts? tsMs(s.ts):null, gap=(ms&&prev)? fmtDur(ms-prev):'';
      if(ms) prev=ms;
      var col=s.status==='CREATED'?'var(--muted)':(SCOL[s.status]||'var(--muted)');
      return '<li'+(s.missing?' class="miss"':'')+'><span class="hdot" style="background:'+col+'"></span>'
        + '<span class="hlab">'+esc(s.label)+'</span>'
        + '<span class="hts">'+(s.ts? esc(fmtTs(s.ts)) : '<i>not recorded</i>')+'</span>'
        + '<span class="hgap">'+esc(gap)+'</span></li>';
    }).join('');
    var firstMs=null, lastMs=null;
    steps.forEach(function(s){ var m=s.ts?tsMs(s.ts):null; if(m){ if(firstMs===null) firstMs=m; lastMs=m; } });
    var lead=(firstMs&&lastMs&&lastMs>firstMs)? '<div class="hfoot">Lead time <b>'+esc(fmtDur(lastMs-firstMs))+'</b></div>' : '';
    var note=JOURNAL_SINCE && !(JOURNAL[t.id]||[]).length
      ? '<div class="hfoot dim">No transition recorded — the ticket journal only covers changes made since '+esc(fmtTs(JOURNAL_SINCE))+'.</div>'
      : (!JOURNAL_SINCE ? '<div class="hfoot dim">Ticket journal not started yet — it fills up as agents move tickets in <code>memory/kanban.md</code>.</div>' : '');
    return '<h4 class="mgrp">History</h4><ul class="hist">'+rows+'</ul>'+lead+note;
  }

  // ── Captures d'écran rattachées au ticket ─────────────────
  // Les PNG restent sur disque et sont référencés en relatif : les inliner ferait
  // grossir le rapport de ~300 Ko par prise de vue.
  function shotUrl(s){ return /^data:/.test(s.src) ? s.src : AILED_ROOT + s.src; }
  function screensBlock(t){
    var sc=SCREENS[String(t.id||'').toUpperCase()];
    if(!sc) return '';
    var groups=[], byKey={};
    (sc.shots||[]).forEach(function(s){
      var key=(s.screen||'')+'|'+(s.state||'');
      if(!byKey[key]){ byKey[key]={ screen:s.screen, state:s.state, route:s.route, criterion:s.criterion, shots:[] }; groups.push(byKey[key]); }
      byKey[key].shots.push(s);
    });
    var body=groups.map(function(g){
      return '<figure class="shotgrp">'
        + '<figcaption>'+(g.screen? '<b>'+esc(g.screen)+'</b>':'')
        + (g.route? '<code>'+esc(g.route)+'</code>':'')
        + (g.state? '<span class="st">'+esc(g.state)+'</span>':'')
        + (g.criterion? '<span class="crit">'+esc(g.criterion)+'</span>':'')+'</figcaption>'
        + '<div class="shots">'+g.shots.map(function(s){
            return '<a class="shot" href="'+esc(shotUrl(s))+'" data-shot="1" title="Click to enlarge">'
              + '<img loading="lazy" src="'+esc(shotUrl(s))+'" alt="'+esc((g.screen||'')+' '+(g.state||''))+'">'
              + '<span class="vp">'+esc(s.viewport||'')+'</span></a>';
          }).join('')+'</div></figure>';
    }).join('');
    var un=(sc.unreached||[]).length
      ? '<ul class="unreach">'+sc.unreached.map(function(u){ return '<li><b>'+esc(u.screen||u.state||'state')+'</b> not reached — '+esc(u.reason||'no reason given')+'</li>'; }).join('')+'</ul>' : '';
    var cons=(sc.console||[]).length
      ? '<details class="conslog"><summary>'+sc.console.length+' console message(s)</summary><ul>'+sc.console.map(function(m){ return '<li>'+esc(String(m).slice(0,300))+'</li>'; }).join('')+'</ul></details>' : '';
    if(!body && !un) return '';
    return '<h4 class="mgrp">Screens captured at test time'
      + (sc.capturedAt? ' <span class="mgrp-sub">'+esc(fmtTs(sc.capturedAt))+(sc.olderRuns? ' · '+sc.olderRuns+' earlier run(s) on disk':'')+'</span>':'')+'</h4>'
      + body + un + cons;
  }

  // ── Lightbox (une capture en grand) ───────────────────────
  function openShot(url){
    var lb=document.getElementById('lightbox');
    lb.querySelector('img').src=url;
    lb.hidden=false;
  }
  function closeShot(){ var lb=document.getElementById('lightbox'); if(lb){ lb.hidden=true; lb.querySelector('img').removeAttribute('src'); } }

  // ── État dérivé, recalculé à chaque rendu ─────────────────
  var epics=[], epicIds=[], tickets=[], board={}, miles=[], msByEpic={}, integ=[];
  var total=0, done=0, pct=0, state=null;

  // ordre « plus récent d'abord » : numéro de ticket, puis ordre d'apparition
  function recent(a,b){ return (b.num-a.num)||(b.seq-a.seq); }
  // jalon de rattachement d'un ticket, via la colonne EPICs de roadmap.md
  function ticketMilestone(t){
    var found=null;
    (t.epics||[]).some(function(e){ if(msByEpic[e]){ found=msByEpic[e]; return true; } return false; });
    return found;
  }
  // « M3+++ — Galerie navigable » → « M3+++ »
  function msKey(m){ return m ? mdPlain(m.name.split(/\\s+[—–-]\\s+/)[0]||m.name) : ''; }

  function computeModel(){
    integ = parseIntegrations((get('config')||{}).content);
    epics = parseEpics((get('epics')||{}).content);
    epicIds = epics.map(function(e){ return e.id; });
    // tickets vivants + tickets archivés par @ailed-release (memory/archive/kanban.md) :
    // sans l'archive, les EPICs livrées paraissent vides et l'avancement est sous-estimé.
    // Dédoublonnage par ID, le kanban vivant faisant foi.
    var live=parseKanbanFull((get('kanban')||{}).content, epicIds, 1000000, false);
    var old=parseKanbanFull(ARCHIVE.kanban, epicIds, 0, true);
    var seen={}; tickets=[];
    live.concat(old).forEach(function(t){
      if(t.id){ if(seen[t.id]) return; seen[t.id]=1; }
      tickets.push(t);
    });
    board={}; STATUSES.forEach(function(s){ board[s]=[]; });
    tickets.forEach(function(t){ if(board[t.status]) board[t.status].push(t); });
    total = STATUSES.reduce(function(n,s){ return n+board[s].length; },0);
    done = board.DONE.length;
    pct = total ? Math.round(done/total*100) : 0;
    state = stateSection((get('project-state')||{}).content);
    miles = parseMilestonesFull((get('roadmap')||{}).content);
    msByEpic = {};
    miles.forEach(function(m){ m.epics.forEach(function(e){ if(!msByEpic[e]) msByEpic[e]=m; }); });
  }

  var DONE_SHOWN = 5;

  function renderSynth(){
    // ── En-tête / badges ──────────────────────────────────────
    document.getElementById('badges').innerHTML =
      integ.map(function(it){
        return it.on ? '<span class="badge on">'+esc(it.area)+' <b>'+esc(it.tool)+'</b></span>'
                     : '<span class="badge off">'+esc(it.area)+'</span>';
      }).join('') + '<span class="badge style">style&nbsp;<b>'+esc(STYLE)+'</b></span>';

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

    var ms = milestoneProgress(miles, epics, tickets);
    var msCard;
    if(ms){
      var msSegs=[{ value:ms.done, color:SCOL.DONE },{ value:Math.max(0,ms.total-ms.done), color:'var(--border)' }];
      msCard =
        '<div class="card pie-card">'
        + '<div class="piefig">'+pieSvg(msSegs,{big:ms.pct+'%',small:'≈ est.'})+'</div>'
        + '<div class="pieinfo"><h3>Current milestone</h3>'
        +   '<div class="pie-sub"><b style="color:var(--text)">'+esc(mdPlain(ms.name))+'</b>'+(ms.target?' · target '+esc(ms.target):'')+'</div>'
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

    // ── Timeline des EPICs (nœud = camembert d'avancement) ────
    var epList = epics.length ? epics : (function(){
      var seen=[]; tickets.forEach(function(t){ if(t.epic && !seen.find(function(e){return e.id===t.epic;})) seen.push({ id:t.epic, title:'', status:'todo' }); }); return seen;
    })();
    var timelineHtml = epList.length ? epList.map(function(e){
      var eff=epicEff(e,tickets), prog=epicProgress(e.id);
      var tip=e.id+(prog? ' — '+prog.done+'/'+prog.total+' tickets done ('+prog.pct+'%)':' — no ticket linked')+' · click for details';
      return '<li class="'+eff+' clickable" data-epic="'+esc(e.id)+'" title="'+esc(tip)+'">'
        + nodePie(eff,prog)
        + '<span class="ep-id">'+esc(e.id)+'</span>'
        + '<span class="ep-title">'+esc(mdPlain(e.title||''))+'</span>'
        + (prog? '<span class="ep-pct">'+prog.pct+'% · '+prog.done+'/'+prog.total+'</span>':'<span class="ep-pct dim">no ticket</span>')
        + '</li>';
    }).join('') : '<li class="todo">'+nodePie('todo',null)+'<span class="ep-title">No EPIC defined</span></li>';

    // ── Kanban : une colonne par statut non-DONE, + les DONE récentes à droite ─
    function kcard(t){
      var m=ticketMilestone(t);
      var sc=SCREENS[String(t.id||'').toUpperCase()];
      var nshots=sc? (sc.shots||[]).length : 0;
      return '<div class="kcard'+(t.status==='SUPERSEDED'?' sup':'')+'" data-tid="'+esc(t.id)+'" style="--cc:'+(SCOL[t.status]||'#8b929e')
        + '" title="'+esc(clampText(mdPlain(t.title),300)).replace(/"/g,'&quot;')+' — click for details">'
        + '<span class="kms">'+esc(m? msKey(m):'—')+'</span>'
        + '<span class="kep">'+esc((t.epics||[]).join(' ')||'no EPIC')+'</span>'
        + '<span class="kid">'+esc(t.id||'—')+(nshots? '<span class="kshot" title="'+nshots+' screen(s) captured">▣ '+nshots+'</span>':'')+'</span>'
        + '<span class="ktt">'+mdInline(t.title||'(untitled)')+'</span>'
        + (t.status==='OTHER'? '<span class="kraw">'+esc(t.raw)+'</span>':'')
        + '</div>';
    }
    function kcol(st, list, shown){
      var extra=shown && list.length>shown ? list.length-shown : 0;
      var body=list.length
        ? list.slice(0, shown||list.length).map(kcard).join('')
          + (extra? '<button class="kmore" type="button" data-st="'+st+'">+ '+extra+' more…</button>':'')
        : '<div class="kempty">—</div>';
      return '<div class="kcol"><h4><span class="kdot" style="background:'+(SCOL[st]||'#8b929e')+'"></span>'+(LABEL[st]||st)
        + '<span class="kn'+(list.length?' clickable" data-st="'+st+'" title="Click to list them all':'')+'">'+list.length+'</span></h4>'
        + body+'</div>';
    }
    // statuts non-DONE du référentiel, puis SUPERSEDED / OTHER seulement s'ils existent
    var boardCols = STATUSES.filter(function(s){ return s!=='DONE'; })
      .concat(OFF_BOARD.filter(function(s){ return tickets.some(function(t){ return t.status===s; }); }))
      .map(function(st){ return kcol(st, tickets.filter(function(t){ return t.status===st; }).sort(recent)); }).join('');
    // dernière colonne : les DONE, bornées aux plus récentes (numéro de ticket décroissant)
    var boardHtml = '<div class="kanban">'+boardCols+kcol('DONE', board.DONE.slice().sort(recent), DONE_SHOWN)+'</div>';

    // ── Watch-out list ────────────────────────────────────────
    var watch=[];
    DATA.forEach(function(e){ if(e.age!==null && e.age>staleLimit(e.name)) watch.push(esc(e.file)+' — '+e.age+' days without update'); });
    var off = integ.filter(function(it){ return !it.on; }).map(function(it){ return esc(it.area); });
    if(off.length) watch.push('Disabled integrations: '+off.join(', '));
    if(board.TO_CHECK.length) watch.push(board.TO_CHECK.length+' pending TO_CHECK clarification(s)');
    var watchHtml = watch.length ? watch.map(function(w){ return '<li>'+w+'</li>'; }).join('') : '<li class="empty">Nothing to report</li>';

    // Chapô : extrait borné en texte brut (jamais de markdown à l'écran) + lien vers la popup
    var ledeHtml = state
      ? '<p class="lede">'+esc(clampText(state.first,300))+' <button class="more" type="button" id="stateMore">Read the full state</button></p>'
      : '';

    document.getElementById('synth').innerHTML =
      '<h2 class="sec">Overview</h2>'
      + ledeHtml
      + '<div class="kpis">'+globalCard+msCard+statsCard+'</div>'
      + '<h2 class="sec">EPIC timeline</h2>'
      + '<div class="card"><ol class="epic-timeline">'+timelineHtml+'</ol></div>'
      + '<h2 class="sec">Kanban — open tasks · '+DONE_SHOWN+' latest done</h2>'
      + boardHtml
      + '<h2 class="sec">Watch out</h2>'
      + '<div class="card"><ul class="watch">'+watchHtml+'</ul></div>';
  }

  // ── Détail (replié) ───────────────────────────────────────
  function renderDetail(){
    var open = STYLE==='detailed' ? ' open' : '';
    var wasOpen={};
    document.querySelectorAll('#detail details.file').forEach(function(d){ wasOpen[d.id]=d.open; });
    var toc='', det='';
    DATA.forEach(function(e){
      var stale=(e.age!==null && e.age>staleLimit(e.name));
      toc += '<a href="#f-'+e.name+'" data-t="f-'+e.name+'">'+esc(e.title)+(stale?' <span class="dot">●</span>':'')+'</a>';
      var stamp = e.date ? ('upd '+e.date+(e.age!==null?(' · '+e.age+' d'+(stale?' — stale':'')):'')) : 'date unknown';
      var id='f-'+e.name;
      var op = (id in wasOpen) ? (wasOpen[id]?' open':'') : open;
      det += '<details class="file" id="'+id+'"'+op+'><summary><span class="sf">'+esc(e.file)+'</span> '+esc(e.title)+'<span class="st">'+stamp+'</span></summary><div class="md">'+marked.parse(e.content)+'</div></details>';
    });
    document.getElementById('toc').innerHTML = toc;
    document.getElementById('detail').innerHTML = det;

    document.querySelectorAll('code.language-mermaid').forEach(function(code){
      var div = document.createElement('div'); div.className='mermaid'; div.textContent = code.textContent;
      (code.closest('pre')||code).replaceWith(div);
    });
    runMermaid();
  }

  // Mermaid mesure le DOM pour dimensionner ses diagrammes : le lancer sur un conteneur
  // encore replié (display:none) donne des largeurs indéfinies — d'où des diagrammes mal
  // dimensionnés et un « translate(undefined, NaN) » en console. On attend donc que le
  // panneau de détail soit visible, et on ne traite que les nœuds pas encore rendus.
  // initialize doit rester immédiat : chargé par balise CDN, mermaid a startOnLoad à
  // true par défaut et se lancerait tout seul au DOMContentLoaded — donc sur un panneau
  // encore replié, ce qu'on cherche justement à éviter. Seul run est différé.
  if (window.mermaid) mermaid.initialize({ startOnLoad:false, theme:'default' });
  function runMermaid(){
    if(!window.mermaid) return;
    var wrap=document.getElementById('detailWrap');
    if(!wrap || wrap.hidden) return;
    var pending=[].filter.call(document.querySelectorAll('.mermaid'), function(d){ return !d.getAttribute('data-processed'); });
    if(!pending.length) return;
    try { mermaid.run({ nodes:pending }); } catch(_) {}
  }

  function render(){
    computeModel();
    renderSynth();
    renderDetail();
    document.getElementById('gen').textContent = 'generated on '+PAYLOAD.generated+' · read-only';
    // une popup ouverte est réaffichée avec les données fraîches
    if(lastModal) try { lastModal(); } catch(_) { closeModal(); }
  }

  // ── Câblage, posé une seule fois ──────────────────────────
  function wire(){
    var detailWrap=document.getElementById('detailWrap');
    var toggleBtn=document.getElementById('toggleDetail');
    function setDetail(show){
      detailWrap.hidden=!show;
      toggleBtn.setAttribute('aria-expanded', show?'true':'false');
      toggleBtn.textContent=(show?'▾':'▸')+' Memory detail (raw files)';
      if(show) runMermaid();
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
      if(ev.target.closest('#stateMore')){ openState(); return; }
      var st=ev.target.closest('li[data-st], .kn[data-st], .kmore[data-st]');
      if(st){ openStatus(st.getAttribute('data-st')); return; }
      var tk=ev.target.closest('.kcard[data-tid]'); if(tk){ openTicket(tk.getAttribute('data-tid')); return; }
      var ep=ev.target.closest('li[data-epic]'); if(ep){ openEpic(ep.getAttribute('data-epic')); return; }
      var k=ev.target.closest('.stat[data-kind]');
      if(k){ var kind=k.getAttribute('data-kind'); if(kind==='bugs') openIncidents(); else if(kind==='vulns') openVulns(); else openCandidates(); }
    });
    // bouton Feature list (en-tête)
    document.getElementById('featBtn').addEventListener('click', openFeatures);
    // fermeture du modal : croix, fond, Échap · une capture s'ouvre en grand
    document.getElementById('modal').addEventListener('click', function(ev){
      var a=ev.target.closest('a[data-shot]');
      if(a){ ev.preventDefault(); openShot(a.getAttribute('href')); return; }
      if(ev.target.getAttribute('data-close') || ev.target.closest('#modalClose')) closeModal();
    });
    document.getElementById('lightbox').addEventListener('click', closeShot);
    document.addEventListener('keydown', function(ev){
      if(ev.key!=='Escape') return;
      if(!document.getElementById('lightbox').hidden) closeShot(); else closeModal();
    });
  }

  // ── Rechargement à chaud ──────────────────────────────────
  // data.js est rechargé par balise <script> et non par fetch() : en file://, fetch est
  // bloqué par CORS, pas une balise script. Le paramètre d'horodatage sert de cache-buster.
  // On ne redessine que si l'empreinte du contenu change — sinon la page clignoterait.
  var liveTimer=null;
  function pollData(){
    var s=document.createElement('script');
    s.src=DATA_SRC+(DATA_SRC.indexOf('?')>=0?'&':'?')+'t='+Date.now();
    s.onload=function(){
      s.remove();
      var p=window.__AILED__;
      if(!p || p.stamp===PAYLOAD.stamp){ markLive(true); return; }
      var y=window.scrollY;
      adopt(p); render();
      window.scrollTo(0,y);
      markLive(true, 'updated ' + new Date().toTimeString().slice(0,8));
    };
    s.onerror=function(){ s.remove(); markLive(false); };
    document.head.appendChild(s);
  }
  function markLive(ok, msg){
    var el=document.getElementById('live'); if(!el) return;
    el.className='live'+(ok?'':' off');
    el.title=ok? (msg||'watching '+DATA_SRC) : 'cannot reload '+DATA_SRC+' — open the report from the project folder';
  }
  function adopt(p){
    PAYLOAD=p; DATA=p.files||[]; ARCHIVE=p.archive||{kanban:''};
    STYLE=p.style||'standard'; SCREENS=p.screens||{}; JOURNAL=p.journal||{}; JOURNAL_SINCE=p.journalSince||null;
  }

  adopt(PAYLOAD);
  wire();
  render();
  if(DATA_SRC){
    liveTimer=setInterval(pollData, 2000);
    document.getElementById('live').addEventListener('click', function(){
      if(liveTimer){ clearInterval(liveTimer); liveTimer=null; this.classList.add('paused'); this.title='live reload paused — click to resume'; }
      else { liveTimer=setInterval(pollData, 2000); this.classList.remove('paused'); markLive(true); }
    });
  } else {
    var l=document.getElementById('live'); if(l) l.hidden=true; // instantané autonome : rien à recharger
  }
</script>
</body>
</html>`;

// ── memory-diff: ce qui a changé dans memory/, section par section ──────────
// Les agents réécrivent memory/ en continu. Avant qu'un humain valide ou commite,
// la question utile n'est pas « que dit le fichier » mais « qu'est-ce que l'agent a
// changé, et où ». `git diff` y répond en hunks bruts ; on regroupe les mêmes données
// par section markdown, avec les tickets touchés, pour qu'une relecture coûte un
// coup d'œil au lieu d'une lecture. Déterministe et zéro token : le skill
// /ailed-memory-diff lance la commande d'abord et n'interprète que le résultat.
function gitCapture(args) {
  const cp = require("child_process");
  const r = cp.spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

// index de ligne (0-based) → fil d'Ariane « H2 › H3 › … » de son titre de section.
// Le H1 est le titre du fichier (bruit dans un rapport par fichier) : il n'apparaît
// que s'il est le seul titre au-dessus de la ligne.
function headingBreadcrumbs(lines) {
  const map = new Array(lines.length).fill("");
  const stack = [];
  let cur = "";
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (m) {
      const lvl = m[1].length, txt = m[2].trim();
      while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
      stack.push({ lvl, txt });
      const deep = stack.filter((s) => s.lvl > 1).map((s) => s.txt);
      cur = (deep.length ? deep : stack.map((s) => s.txt)).join(" › ");
    }
    map[i] = cur;
  }
  return map;
}

const DIFF_PREAMBLE = "(en-tête du fichier)";
const DIFF_MAX_LINES = 40;         // lignes rendues par section, au-delà on résume
const DIFF_NEWFILE_SUMMARY = 60;   // au-delà, un fichier entièrement nouveau est résumé par son plan
const DIFF_MAX_OUTLINE = 12;       // sections listées dans ce plan
const DIFF_MAX_TICKETS = 12;       // tickets listés dans le total (une plage large en touche des dizaines)

// contenu de `<ref>:<rel>` en lignes, ou null si le fichier n'existe pas à cette révision
function blobLines(ref, rel) {
  const out = gitCapture(["show", `${ref}:${rel}`]);
  return out === null ? null : out.split("\n");
}
function worktreeLines(rel) {
  const p = path.join(cwd, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n") : null;
}

function newDiffFile(rel, kind) {
  return { rel, kind, added: [], removed: [], sections: [], index: new Map(), tickets: [], notes: [] };
}
// enregistre une ligne (+/-) dans la section où elle tombe, en conservant l'ordre
// de première apparition des sections (= l'ordre du fichier, `git diff` étant ordonné)
// lignes affichables d'un groupe : les lignes blanches comptent dans le diff (les
// compteurs restent ceux de git) mais n'apportent rien à une relecture — on ne les rend pas
function shownDiffLines(g) {
  const keep = (l) => l.trim() !== "";
  return { removed: g.removed.filter(keep), added: g.added.filter(keep) };
}
function pushDiffLine(f, section, sign, text) {
  const key = section || DIFF_PREAMBLE;
  let g = f.index.get(key);
  if (!g) { g = { section: key, added: [], removed: [] }; f.index.set(key, g); f.sections.push(g); }
  (sign === "+" ? g.added : g.removed).push(text);
  (sign === "+" ? f.added : f.removed).push(text);
}

// notes de relecture : ce qui, dans un diff de mémoire, mérite un regard humain
// Deux cas où déplier les lignes noierait le rapport sans rien apprendre :
//  · un fichier entièrement nouveau (ajouté ou non suivi) — tout y est « + », et une SPEC
//    fraîche fait des milliers de lignes ; son plan dit l'essentiel ;
//  · un fichier non markdown de memory/ (une maquette HTML de @ailed-ux, p. ex.) — il n'a
//    pas de sections et se relit dans un navigateur, pas dans un diff.
// `--full` déplie les deux quand c'est voulu.
function summarizeNewFile(f) {
  if (argv.includes("--full")) return false;
  if (!/\.md$/i.test(f.rel)) return true;
  return (f.kind === "added" || f.kind === "untracked") && f.added.length > DIFF_NEWFILE_SUMMARY;
}
// Table des matières : les sections de premier niveau, dédupliquées. Les fils d'Ariane
// complets (`H2 › H3 › H4`) répètent le parent à chaque enfant — illisible sur 129 sections.
function fileOutline(f) {
  const seen = new Set();
  for (const g of f.sections) {
    const top = String(g.section || "").split(" › ")[0].trim();
    if (top && top !== DIFF_PREAMBLE) seen.add(top);
  }
  return [...seen];
}
// libellé du bloc résumé, selon ce qui est résumé et ce qu'on a pu en extraire
function summaryLabel(f, outline) {
  const kind = /\.md$/i.test(f.rel) ? "fichier entièrement nouveau" : "fichier non markdown";
  const plan = outline.length ? `, ${outline.length} section(s)` : "";
  return { head: `${f.added.length} ligne(s)${plan}`, why: `contenu non déplié (${kind}) — --full pour tout voir` };
}
function annotateDiffFile(f, trigram) {
  const seen = new Set();
  const ticketRe = trigram ? new RegExp("\\b" + trigram + "-\\d+\\b", "g") : null;
  if (ticketRe) {
    for (const l of f.added.concat(f.removed)) {
      for (const m of l.match(ticketRe) || []) seen.add(m);
    }
  }
  f.tickets = [...seen].sort();
  for (const l of f.removed) {
    const h = l.match(/^\s*(#{1,6})\s+(.+?)\s*#*$/);
    if (h) f.notes.push(`section supprimée : « ${h[2].trim()} »`);
  }
  if (f.kind === "modified" && !f.added.some((l) => /Last Updated\s*:/i.test(l))) {
    f.notes.push("`Last Updated` non mis à jour");
  }
}

// Parse `git diff -U0` en { files, totals } regroupés par section markdown.
// `until` absent = comparaison avec la copie de travail (les fichiers non suivis
// comptent alors comme entièrement ajoutés — sinon un memory/ jamais commité
// apparaîtrait vide).
function collectMemoryDiff(since, until, trigram) {
  const args = ["diff", "--no-color", "--no-ext-diff", "-U0", "-M", since];
  if (until) args.push(until);
  args.push("--", "memory/");
  const raw = gitCapture(args);
  if (raw === null) return null;

  const files = [];
  let f = null, oldMap = [], newMap = [], oldNo = 0, newNo = 0;
  const close = () => { if (f && (f.added.length || f.removed.length)) { annotateDiffFile(f, trigram); files.push(f); } };

  for (const line of raw.split("\n")) {
    let m;
    if ((m = line.match(/^diff --git a\/(.+?) b\/(.+)$/))) {
      close();
      const oldRel = m[1], rel = m[2];
      const oldL = blobLines(since, oldRel);
      const newL = until ? blobLines(until, rel) : worktreeLines(rel);
      oldMap = headingBreadcrumbs(oldL || []);
      newMap = headingBreadcrumbs(newL || []);
      const kind = !oldL ? "added" : !newL ? "deleted" : oldRel !== rel ? "renamed" : "modified";
      f = newDiffFile(rel, kind);
      if (kind === "renamed") f.notes.push(`renommé depuis \`${oldRel}\``);
      oldNo = newNo = 0;
      continue;
    }
    if (!f) continue;
    if ((m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/))) {
      oldNo = parseInt(m[1], 10); newNo = parseInt(m[2], 10);
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("\\")) continue;
    if (line.startsWith("+")) { pushDiffLine(f, newMap[newNo - 1], "+", line.slice(1)); newNo++; continue; }
    if (line.startsWith("-")) { pushDiffLine(f, oldMap[oldNo - 1], "-", line.slice(1)); oldNo++; continue; }
  }
  close();

  // fichiers memory/ non suivis par git : invisibles pour `git diff`, mais bien
  // des modifications du point de vue de la relecture
  if (!until) {
    const untracked = (gitCapture(["ls-files", "--others", "--exclude-standard", "--", "memory/"]) || "")
      .split("\n").map((s) => s.trim()).filter(Boolean);
    for (const rel of untracked) {
      const lines = worktreeLines(rel);
      if (!lines) continue;
      const map = headingBreadcrumbs(lines);
      const nf = newDiffFile(rel, "untracked");
      lines.forEach((l, i) => { if (l.trim()) pushDiffLine(nf, map[i], "+", l); });
      if (!nf.added.length) continue;
      annotateDiffFile(nf, trigram);
      nf.notes = nf.notes.filter((n) => !/Last Updated/.test(n));
      nf.notes.unshift("fichier non suivi par git (`git add` manquant)");
      files.push(nf);
    }
  }

  const totals = {
    files: files.length,
    added: files.reduce((n, x) => n + x.added.length, 0),
    removed: files.reduce((n, x) => n + x.removed.length, 0),
    tickets: [...new Set([].concat(...files.map((x) => x.tickets)))].sort(),
  };
  return { files, totals };
}

const DIFF_KIND_LABEL = {
  added: "nouveau", deleted: "supprimé", renamed: "renommé", untracked: "non suivi", modified: "",
};

// ── rendus ───────────────────────────────────────────────────
function memoryDiffTerminal(model, since, until) {
  const width = Math.max(60, process.stdout.columns || 100);
  const clamp = (s, n) => (s.length <= n ? s : s.slice(0, Math.max(1, n - 1)) + "…");
  const target = until ? `${since} → ${until}` : `${since} → copie de travail`;

  console.log(`\n${c.bold("AI-Led")} ${c.dim("v" + pkg.version)} — modifications ${c.cyan("memory/")} ${c.dim("(" + target + ")")}\n`);
  if (!model.files.length) return;

  for (const f of model.files) {
    const kind = DIFF_KIND_LABEL[f.kind];
    const head = `${c.bold(f.rel)}  ${c.green("+" + f.added.length)} ${c.yellow("-" + f.removed.length)}`;
    console.log(kind ? `${head} ${c.dim("[" + kind + "]")}` : head);
    if (f.tickets.length) console.log(`  ${c.dim("tickets : " + f.tickets.join(", "))}`);
    if (summarizeNewFile(f)) {
      const outline = fileOutline(f);
      const lab = summaryLabel(f, outline);
      console.log(`  ${c.dim(lab.head)}`);
      for (const h of outline.slice(0, DIFF_MAX_OUTLINE)) console.log(`    ${c.cyan("·")} ${clamp(h, width - 6)}`);
      if (outline.length > DIFF_MAX_OUTLINE) console.log(`    ${c.dim(`· … ${outline.length - DIFF_MAX_OUTLINE} section(s) de plus`)}`);
      console.log(`  ${c.dim("↳ " + lab.why)}`);
      for (const n of f.notes) console.log(`  ${c.yellow("⚠")} ${n.replace(/`/g, "")}`);
      console.log("");
      continue;
    }
    for (const g of f.sections) {
      const vis = shownDiffLines(g);
      const shown = [
        ...vis.removed.map((l) => ["-", l]),
        ...vis.added.map((l) => ["+", l]),
      ];
      if (!shown.length) continue;
      console.log(`  ${c.cyan(clamp(g.section, width - 4))}`);
      for (const [sign, l] of shown.slice(0, DIFF_MAX_LINES)) {
        const paint = sign === "+" ? c.green : c.yellow;
        console.log(`    ${paint(sign)} ${clamp(l.trim(), width - 7)}`);
      }
      if (shown.length > DIFF_MAX_LINES) {
        console.log(`    ${c.dim(`… ${shown.length - DIFF_MAX_LINES} ligne(s) de plus (voir --html)`)}`);
      }
    }
    for (const n of f.notes) console.log(`  ${c.yellow("⚠")} ${n.replace(/`/g, "")}`);
    console.log("");
  }

  // sur une plage large la liste complète des tickets tient sur une ligne illisible
  const tk = model.totals.tickets;
  const tkStr = tk.length > DIFF_MAX_TICKETS
    ? tk.slice(0, DIFF_MAX_TICKETS).join(", ") + ` … +${tk.length - DIFF_MAX_TICKETS}`
    : tk.join(", ");
  console.log(
    `${c.bold("Total")} : ${model.totals.files} fichier(s), ${c.green("+" + model.totals.added)} ${c.yellow("-" + model.totals.removed)}` +
    (tk.length ? ` ${c.dim(`· ${tk.length} ticket(s) touché(s) : ` + tkStr)}` : "")
  );
  console.log(`${c.dim("Rapport navigateur :")} npx @s2bp/ai-led-framework memory-diff --html`);
  console.log(`${c.dim("Relecture commentée dans Claude Code :")} /ailed-memory-diff\n`);
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}
// markdown → HTML inline, minimal et hors ligne (même contrat que le mdInline du
// dashboard) : on rend, on n'affiche jamais la source ; les marqueurs orphelins
// (paire coupée par une cellule de table) sont retirés plutôt qu'imprimés.
function mdInlineNode(s) {
  let t = escHtml(s);
  t = t.replace(/`([^`]+)`/g, (_, x) => "<code>" + x + "</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, x) => "<strong>" + x + "</strong>");
  t = t.replace(/~~([^~]+)~~/g, (_, x) => "<s>" + x + "</s>");
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) =>
    /^https?:/.test(href) ? '<a href="' + href.replace(/"/g, "%22") + '" rel="noopener">' + txt + "</a>" : txt);
  return t.replace(/`/g, "").replace(/\*\*/g, "");
}

function newFileOutlineHtml(f) {
  const outline = fileOutline(f);
  const lab = summaryLabel(f, outline);
  const items = outline.slice(0, DIFF_MAX_OUTLINE).map((h) => `<li>${mdInlineNode(h)}</li>`).join("")
    + (outline.length > DIFF_MAX_OUTLINE ? `<li class="more">… ${outline.length - DIFF_MAX_OUTLINE} section(s) de plus</li>` : "");
  return `<section class="sec">${outline.length ? "<h3>Plan du fichier</h3>" : ""}
  <p class="more">${escHtml(lab.head)} — ${escHtml(lab.why)}</p>
  ${outline.length ? `<ul class="outline">${items}</ul>` : ""}</section>`;
}

// Rapport autonome : aucun CDN, aucun script, aucune donnée envoyée — le fichier
// s'ouvre (et s'archive) tel quel. Thème clair par défaut, variante sombre suivant
// les préférences système.
function memoryDiffHtmlDoc(model, since, until, generated) {
  const target = until ? `${since} → ${until}` : `${since} → copie de travail`;
  const body = model.files.map((f) => {
    const kind = DIFF_KIND_LABEL[f.kind];
    const secs = summarizeNewFile(f) ? newFileOutlineHtml(f) : f.sections.map((g) => {
      const vis = shownDiffLines(g);
      if (!vis.removed.length && !vis.added.length) return "";
      const cap = (arr) => arr.slice(0, DIFF_MAX_LINES);
      const over = vis.removed.length + vis.added.length - (cap(vis.removed).length + cap(vis.added).length);
      const rows = [
        ...cap(vis.removed).map((l) => `<div class="ln del"><span class="sig">−</span><span>${mdInlineNode(l.trim())}</span></div>`),
        ...cap(vis.added).map((l) => `<div class="ln add"><span class="sig">+</span><span>${mdInlineNode(l.trim())}</span></div>`),
        over > 0 ? `<p class="more">… ${over} ligne(s) de plus dans cette section</p>` : "",
      ].join("");
      return `<section class="sec"><h3>${mdInlineNode(g.section)}</h3>${rows}</section>`;
    }).join("");
    const notes = f.notes.length
      ? `<ul class="notes">${f.notes.map((n) => `<li>${mdInlineNode(n)}</li>`).join("")}</ul>`
      : "";
    const tickets = f.tickets.length ? `<p class="tickets">Tickets : ${f.tickets.map(escHtml).join(", ")}</p>` : "";
    return `<article class="file">
  <h2>${escHtml(f.rel)}${kind ? ` <span class="kind">${escHtml(kind)}</span>` : ""}
    <span class="counts"><span class="plus">+${f.added.length}</span> <span class="minus">−${f.removed.length}</span></span></h2>
  ${tickets}${notes}${secs}
</article>`;
  }).join("\n");

  const empty = `<p class="empty">Aucune modification dans <code>memory/</code> pour ${escHtml(target)}.</p>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI-Led — modifications memory/</title>
<style>
  :root { --bg:#fff; --panel:#f7f8fa; --border:#e3e6ea; --text:#1c1f23; --muted:#6b7280;
    --add:#116d3a; --addbg:#e8f6ed; --del:#8a2b2b; --delbg:#fdeceb; --accent:#1a56b8; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f1117; --panel:#171a21; --border:#252a34; --text:#e6e8eb; --muted:#8b929e;
      --add:#8fd6a6; --addbg:#14261b; --del:#f0a8a8; --delbg:#2a1618; --accent:#6ea8fe; }
  }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 60px; background:var(--bg); color:var(--text);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:1000px; margin:0 auto; }
  h1 { font-size:20px; margin:0 0 4px; }
  .meta { color:var(--muted); font-size:13px; margin:0 0 22px; }
  .totals { background:var(--panel); border:1px solid var(--border); border-radius:8px;
    padding:10px 14px; font-size:14px; margin:0 0 24px; }
  .file { border:1px solid var(--border); border-radius:8px; margin:0 0 18px; overflow:hidden; }
  .file > h2 { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:0;
    padding:10px 14px; background:var(--panel); border-bottom:1px solid var(--border);
    font-size:15px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .kind { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted);
    border:1px solid var(--border); border-radius:99px; padding:1px 7px; font-family:inherit; }
  .counts { margin-left:auto; font-size:13px; }
  .plus { color:var(--add); } .minus { color:var(--del); }
  .tickets, .notes { margin:10px 14px 0; font-size:13px; color:var(--muted); }
  .notes { padding-left:28px; }
  .notes li { color:var(--del); }
  .sec { padding:10px 14px 4px; }
  .sec h3 { font-size:13px; text-transform:uppercase; letter-spacing:.05em;
    color:var(--accent); margin:8px 0 6px; }
  .ln { display:flex; gap:8px; align-items:flex-start; padding:2px 6px; border-radius:4px;
    font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
  .ln .sig { flex:0 0 auto; font-weight:700; opacity:.7; }
  .add { background:var(--addbg); color:var(--add); }
  .del { background:var(--delbg); color:var(--del); }
  .ln code { background:rgba(127,127,127,.18); border-radius:3px; padding:0 3px; }
  .more { color:var(--muted); font-size:12px; margin:4px 0 2px; }
  .outline { margin:2px 0 6px; padding-left:20px; font-size:13px; }
  .outline li { margin:1px 0; }
  .empty { color:var(--muted); }
  footer { color:var(--muted); font-size:12px; margin-top:32px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Modifications de <code>memory/</code></h1>
  <p class="meta">${escHtml(target)} · généré le ${escHtml(generated)} · AI-Led v${escHtml(pkg.version)}</p>
  ${model.files.length ? `<p class="totals"><strong>${model.totals.files}</strong> fichier(s) · <span class="plus">+${model.totals.added}</span> <span class="minus">−${model.totals.removed}</span>${model.totals.tickets.length ? " · tickets touchés : " + escHtml(model.totals.tickets.join(", ")) : ""}</p>` : empty}
  ${body}
  <footer>Rapport statique — aucun serveur, aucune donnée envoyée.</footer>
</div>
</body>
</html>
`;
}

// Variante presse-papiers : fragment à styles inline, car Teams / Slack / Outlook
// jettent la balise <style>. Pas de pandoc : le rendu markdown est le même que
// celui du rapport.
function memoryDiffClipHtml(model, since, until, generated) {
  const target = until ? `${since} → ${until}` : `${since} → copie de travail`;
  const S = {
    h2: "font-size:15px;margin:16px 0 4px;font-family:monospace;",
    h3: "font-size:13px;margin:10px 0 2px;color:#1a56b8;",
    add: "color:#116d3a;",
    del: "color:#8a2b2b;",
    note: "color:#8a2b2b;font-size:13px;",
    muted: "color:#6b7280;font-size:13px;",
    ul: "margin:2px 0 2px 18px;padding:0;",
  };
  const files = model.files.map((f) => {
    const kind = DIFF_KIND_LABEL[f.kind];
    const secs = summarizeNewFile(f) ? (() => {
      const outline = fileOutline(f);
      const lab = summaryLabel(f, outline);
      return `<p style="${S.muted}">${escHtml(lab.head)} — ${escHtml(lab.why)}</p>`
        + `<ul style="${S.ul}">${outline.slice(0, DIFF_MAX_OUTLINE).map((h) => `<li>${mdInlineNode(h)}</li>`).join("")}`
        + (outline.length > DIFF_MAX_OUTLINE ? `<li style="${S.muted}">… ${outline.length - DIFF_MAX_OUTLINE} section(s) de plus</li>` : "") + `</ul>`;
    })() : f.sections.map((g) => {
      const vis = shownDiffLines(g);
      if (!vis.removed.length && !vis.added.length) return "";
      const items = [
        ...vis.removed.map((l) => `<li style="${S.del}"><del>${mdInlineNode(l.trim())}</del></li>`),
        ...vis.added.map((l) => `<li style="${S.add}"><ins>${mdInlineNode(l.trim())}</ins></li>`),
      ].join("");
      return `<p style="${S.h3}"><strong>${mdInlineNode(g.section)}</strong></p><ul style="${S.ul}">${items}</ul>`;
    }).join("");

    const notes = f.notes.length
      ? `<p style="${S.note}">⚠ ${f.notes.map((n) => mdInlineNode(n)).join(" · ")}</p>`
      : "";
    const tickets = f.tickets.length ? `<p style="${S.muted}">Tickets : ${escHtml(f.tickets.join(", "))}</p>` : "";
    return `<p style="${S.h2}"><strong>${escHtml(f.rel)}</strong>${kind ? ` [${escHtml(kind)}]` : ""} — <span style="${S.add}">+${f.added.length}</span> / <span style="${S.del}">−${f.removed.length}</span></p>${tickets}${notes}${secs}`;
  }).join("");
  return `<p><strong>Modifications de memory/</strong><br><span style="${S.muted}">${escHtml(target)} · ${escHtml(generated)} · ${model.totals.files} fichier(s), +${model.totals.added} / −${model.totals.removed}${model.totals.tickets.length ? " · tickets : " + escHtml(model.totals.tickets.join(", ")) : ""}</span></p>${files}`;
}

// Presse-papiers en text/html, best-effort et sans dépendance lourde : wl-copy
// (Wayland) · xclip (X11) · osascript (macOS). Échec explicite si aucun backend —
// jamais de repli silencieux en texte brut, qui collerait du HTML source.
//
// IMPORTANT : xclip et wl-copy *forkent* pour garder la sélection. Un spawnSync
// avec stdout/stderr en pipe attend la fermeture de ces descripteurs, hérités par
// le fils détaché : la commande se bloque jusqu'à ce qu'un autre programme prenne
// le presse-papiers. D'où `stdio: ["pipe", "ignore", "ignore"]`, puis une relecture
// de la sélection pour ne pas annoncer un succès qui n'a pas eu lieu.
function clipSleep(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}
function copyHtmlToClipboard(html) {
  const cp = require("child_process");
  const has = (bin) => {
    try { return cp.spawnSync("sh", ["-c", "command -v " + bin], { stdio: "ignore" }).status === 0; }
    catch (_) { return false; }
  };
  const write = (bin, args) => {
    const r = cp.spawnSync(bin, args, { input: html, stdio: ["pipe", "ignore", "ignore"] });
    return !r.error && r.status === 0;
  };
  // la sélection est prise par le fils juste après le fork → quelques essais courts
  const readBack = (bin, args) => {
    for (let i = 0; i < 12; i++) {
      const r = cp.spawnSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      if (!r.error && r.status === 0 && (r.stdout || "").slice(0, 40) === html.slice(0, 40)) return true;
      clipSleep(40);
    }
    return false;
  };

  if (process.platform === "darwin") {
    const tmp = path.join(require("os").tmpdir(), `ailed-memory-diff-${process.pid}.html`);
    fs.writeFileSync(tmp, html);
    const ok = cp.spawnSync("osascript", [
      "-e", "on run argv",
      "-e", "set the clipboard to (read (POSIX file (item 1 of argv)) as «class HTML»)",
      "-e", "end run", tmp,
    ], { stdio: "ignore" }).status === 0;
    try { fs.unlinkSync(tmp); } catch (_) {}
    return ok ? "osascript" : null;
  }

  const backends = [];
  if (has("wl-copy")) backends.push({
    name: "wl-copy", args: ["--type", "text/html"],
    read: ["wl-paste", ["--type", "text/html", "--no-newline"]],
    preferred: !!process.env.WAYLAND_DISPLAY,
  });
  if (has("xclip")) backends.push({
    name: "xclip", args: ["-selection", "clipboard", "-t", "text/html", "-i"],
    read: ["xclip", ["-selection", "clipboard", "-o", "-t", "text/html"]],
    preferred: !process.env.WAYLAND_DISPLAY,
  });
  backends.sort((a, b) => Number(b.preferred) - Number(a.preferred));

  for (const b of backends) {
    if (!write(b.name, b.args)) continue;
    if (readBack(b.read[0], b.read[1])) return b.name;
  }
  return null;
}

function memoryDiff() {
  const memDir = path.join(cwd, "memory");
  if (!fs.existsSync(memDir)) {
    console.error(`\n${c.yellow("memory/ introuvable")} dans ${cwd}.`);
    console.error(`Lance d'abord : ${c.cyan("npx @s2bp/ai-led-framework init")}\n`);
    process.exit(1);
  }
  if (gitCapture(["rev-parse", "--git-dir"]) === null) {
    console.error(`\n${c.yellow("Pas un dépôt git")} : ${cwd}`);
    console.error(`memory-diff compare des révisions git — initialise le dépôt (${c.cyan("git init")}) puis commite memory/.\n`);
    process.exit(1);
  }

  const since = flag("since") || "HEAD";
  const until = flag("until") || null;
  for (const ref of [since, until]) {
    if (ref && gitCapture(["rev-parse", "--verify", "--quiet", ref + "^{commit}"]) === null) {
      console.error(`\n${c.yellow("Révision inconnue")} : ${ref}`);
      console.error(`Exemples : ${c.cyan("--since=HEAD~1")} · ${c.cyan("--since=develop")} · ${c.cyan("--since=<sha>")}\n`);
      process.exit(1);
    }
  }

  const installed = parseInstalledConfig(memDir);
  const model = collectMemoryDiff(since, until, installed && installed.trigram);
  if (!model) {
    console.error(`\n${c.yellow("git diff a échoué")} sur memory/ (${since}${until ? " → " + until : ""}).\n`);
    process.exit(1);
  }

  const d = new Date(), p2 = (n) => String(n).padStart(2, "0");
  const generated = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

  if (!model.files.length && !argv.includes("--html") && !argv.includes("--clip")) {
    memoryDiffTerminal(model, since, until);
    console.log(`${c.dim("Aucune modification dans memory/.")}`);
    const last = (gitCapture(["log", "-1", "--format=%h %ad %s", "--date=short", "--", "memory/"]) || "").trim();
    if (last) console.log(`${c.dim("Dernier commit touchant memory/ :")} ${last}`);
    // ne pas resuggérer la plage que l'utilisateur vient déjà de demander
    if (!flag("since") && !flag("until")) {
      console.log(`${c.dim("Pour relire le dernier commit :")} npx @s2bp/ai-led-framework memory-diff --since=HEAD~1 --until=HEAD`);
    }
    console.log("");
    return;
  }

  if (argv.includes("--clip")) {
    const backend = copyHtmlToClipboard(memoryDiffClipHtml(model, since, until, generated));
    if (backend) {
      console.log(`\n${c.green("✓")} Presse-papiers chargé en texte riche ${c.dim("(" + backend + ")")} — collable dans Teams / Slack / Outlook / Confluence.`);
    } else {
      console.error(`\n${c.yellow("Aucun backend presse-papiers")} : installe ${c.cyan("xclip")} (X11) ou ${c.cyan("wl-clipboard")} (Wayland).`);
      console.error(`Repli : ${c.cyan("memory-diff --html")} puis ouvre le rapport dans le navigateur.`);
    }
  }

  if (argv.includes("--html")) {
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const out = path.resolve(cwd, flag("out") || `${stamp}_ailed-memory-diff.html`);
    fs.writeFileSync(out, memoryDiffHtmlDoc(model, since, until, generated));
    console.log(`\n${c.green("✓")} Rapport généré : ${c.cyan(path.relative(cwd, out) || out)}`);
    console.log(`  Ouvre-le dans un navigateur : ${c.dim("file://" + out)}\n`);
    return;
  }

  if (!argv.includes("--clip")) memoryDiffTerminal(model, since, until);
  else console.log("");
}

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

// parse memory/kanban.md → [{id,title,status,epic}] keeping the EPIC link.
// `content` may concatenate the live kanban and its archive: rows are de-duplicated by ID.
function parseKanbanFull(content) {
  const out = [];
  if (!content) return out;
  let map = null;
  const seen = new Set();
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
    const tid = (map.id >= 0 ? cs[map.id] : "").replace(/`/g, "").trim();
    if (tid) {
      if (seen.has(tid)) continue;
      seen.add(tid);
    }
    out.push({
      id: tid,
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

// effective epic status: derived from its tickets, falling back to the file value.
// Tickets outside the progress statuses (SUPERSEDED) are neutral: an EPIC whose live
// work is all DONE stays "done" even when it trails superseded tickets.
function epicEffStatus(epic, tickets) {
  const ts = tickets.filter((t) => t.epic && t.epic === epic.id && STATUSES.indexOf(t.status) >= 0);
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
  // les libellés de la mémoire sont du markdown : on n'affiche jamais les marqueurs
  const plainMd = (s) => String(s || "").replace(/`/g, "").replace(/\*\*/g, "").replace(/~~/g, "").trim();
  const epLabel = (e) => `${e.id}${e.title ? "  " + plainMd(e.title) : ""}`;
  const tkLabel = (t) => `${t.id ? t.id + " " : ""}${plainMd(t.title)}`.trim() || "(sans titre)";
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
    const linked = tickets.filter((t) => e.id && t.epic === e.id && STATUSES.indexOf(t.status) >= 0);
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

  // footer — mêmes compteurs que `ai-led status` : hors statuts d'avancement exclus
  const counted = tickets.filter((t) => STATUSES.indexOf(t.status) >= 0);
  const total = counted.length;
  const done = counted.filter((t) => t.status === "DONE").length;
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
    // archive incluse : sans elle, une EPIC dont tous les tickets sont archivés paraît vide
    const tickets = parseKanbanFull(
      safeRead(path.join(memDir, "kanban.md")) + "\n\n" + readKanbanArchive(memDir)
    );
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
  memory-diff     Liste ce qui a changé dans memory/ (par section) ; --html / --clip pour la relecture humaine
  clean           Taille .ailed/ (captures antérieures, journal des tickets) sans rien perdre de versionné
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
  --html              Génère le tableau de bord (ailed-status.html), sans serveur
  --live              Régénère les données dès que memory/ ou les captures bougent (Ctrl-C pour arrêter)
  --interval=MS       Période de sondage de --live (défaut : 1000)
  --snapshot          Produit un fichier horodaté 100 % autonome (captures inlinées), à partager
  --out=CHEMIN        Chemin du fichier HTML généré (défaut : ailed-status.html)
  --style=NIVEAU      Force le style pour ce run : concis | standard | détaillé (sinon lu dans memory/config.md)

  Le terminal et le HTML montrent d'abord une synthèse (avancement, board kanban, jalons,
  « à surveiller ») ; le HTML met le détail des fichiers memory/ dans des accordéons repliés.

  Le rapport a un nom stable : on le garde ouvert, on le met en marque-page, et il se
  redessine seul dès que les données changent — la coquille HTML (~60 Ko) est séparée de
  sa charge utile (.ailed/status/data.js), chargée par balise <script> et non par fetch(),
  seule façon de recharger à chaud en file:// sans serveur. Les captures d'écran restent
  des PNG sur disque référencés en relatif : les inliner ferait grossir le rapport de
  ~300 Ko par prise de vue. --snapshot fait l'inverse à la demande, pour un fichier unique
  qui se partage tel quel.

${c.bold("Options de clean")}
  --screens           Ne purge que les captures : garde la dernière planche par ticket
  --journal           Ne compacte que .ailed/journal.jsonl (1re entrée par statut + 10 derniers events)

  Sans option, les deux. .ailed/ est dérivé et ignoré par git : rien de versionné n'est touché.

${c.bold("Options de memory-diff")}
  --since=REF         Révision de départ : HEAD (défaut), HEAD~1, une branche, un sha
  --until=REF         Révision d'arrivée (défaut : la copie de travail, fichiers non suivis inclus)
  --html              Génère un rapport HTML autonome (aucun CDN, aucun script, aucune donnée envoyée)
  --out=CHEMIN        Chemin du rapport HTML (défaut : <horodatage>_ailed-memory-diff.html)
  --clip              Charge le rapport en texte riche dans le presse-papiers (Teams / Slack / Outlook)
  --full              Déplie aussi le contenu des fichiers entièrement nouveaux (résumés par défaut)

  Le diff est regroupé par section markdown, avec les tickets touchés et les points à
  surveiller (section supprimée, « Last Updated » non mis à jour, fichier non commité).
  Un fichier entièrement nouveau (une SPEC fraîche, p. ex.) est résumé par son plan : tout y
  serait « + », et le déplier noierait le rapport. --full le déplie quand c'est voulu.
  --clip utilise wl-copy / xclip / osascript ; sans backend, il le dit au lieu de coller du HTML brut.

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
    case "memory-diff":
      memoryDiff();
      break;
    case "clean":
      clean();
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
