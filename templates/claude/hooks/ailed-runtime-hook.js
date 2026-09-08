#!/usr/bin/env node
"use strict";

/*
 * AI-Led runtime hook — feeds the `ai-led watch` progress sidebar.
 *
 * Installed into the target project at .claude/hooks/ailed-runtime-hook.js and
 * wired in .claude/settings.json:
 *   PreToolUse  (matcher "*")    → node .claude/hooks/ailed-runtime-hook.js pre
 *   PostToolUse (matcher "Task") → node .claude/hooks/ailed-runtime-hook.js post
 *
 * It reads the hook payload (JSON) on stdin and writes <project>/.ailed/runtime.json:
 *   - Task tool with a subagent_type → records which agent is running / has finished
 *     (the ailed-* workflow chain drives the "next agents" projection in the sidebar).
 *   - Any other tool (Edit/Bash/Read…) on pre → records it as `lastTool`, giving the
 *     sidebar a live heartbeat during direct main-loop work (no subagent running).
 * Strictly best-effort: it never throws and always exits 0 so it can never disrupt
 * Claude Code.
 *
 * Bonus: when a workflow's capstone agent finishes and no agents remain running,
 * it emits a `systemMessage` suggesting `/clear` — a natural task boundary where
 * the conversation context can be reset safely (project state lives in memory/,
 * not the chat). A hook cannot run `/clear` itself; it only nudges the user.
 */

const fs = require("fs");
const path = require("path");

const phase = (process.argv[2] || "pre").toLowerCase(); // "pre" | "post"

// Workflow membership for the *specific* agents (shared agents like dev/review/
// test/communication keep whatever workflow is already active).
const WORKFLOW_OF = {
  "ailed-scout": "discovery",
  "ailed-seo-aso": "discovery",
  "ailed-monetization": "discovery",
  "ailed-fact-check": "discovery",
  "ailed-analyst": "discovery",
  "ailed-brainstorm": "feature",
  "ailed-ux": "feature",
  "ailed-pm": "feature",
  "ailed-architect": "feature",
  "ailed-planner": "feature",
  "ailed-release": "feature",
  "ailed-check-log": "incident",
  "ailed-rca": "incident",
  "ailed-check-secu": "security",
  "ailed-security-review": "security",
};

// Capstone agents — the natural end of each workflow. When one of these finishes
// and nothing else is running, we nudge the user to `/clear` before the next task.
const TERMINAL_OF = {
  "ailed-analyst": "discovery",
  "ailed-release": "feature",
  "ailed-rca": "incident",
  "ailed-security-review": "security",
};

// Ticket-boundary agents — not workflow capstones, but each one closes a unit of
// work whose state is fully persisted in memory/. `ailed-dev` is the main driver
// of long, expensive sessions (>150k context), so we nudge /clear per ticket too.
const TICKET_BOUNDARY = new Set(["ailed-dev"]);

// ── Journal des transitions de tickets ──────────────────────────────────────
// L'historique d'un ticket (créé → en dev → à tester → fini) n'existe nulle part :
// `memory/kanban.md` ne porte qu'une date de création, et l'y ajouter alourdirait la
// table que *tous* les agents relisent. On la capte donc ici, hors mémoire : à chaque
// écriture du kanban, on rediffe les statuts et on append les transitions dans
// `.ailed/journal.jsonl`. Déterministe, zéro token, aucune discipline d'agent requise —
// un `sed` dans un Bash est vu comme un Edit, puisqu'on compare l'état du fichier.

const KANBAN_RE = /^(TO_CHECK|TODO|IN_PROGRESS|TO_TEST|DONE|SUPERSEDED)$/;

// statut canonique, tolérant aux backticks / casse / accents / formulation FR-EN et à un
// qualificatif en suffixe (« DONE (PR #118, mergé develop) » → DONE).
function canonStatus(raw) {
  let v = String(raw || "").replace(/`/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toUpperCase().replace(/[\s\-–—]+/g, "_");
  v = v.split("(")[0].replace(/^_+|_+$/g, "");
  if (!v) return null;
  if (KANBAN_RE.test(v)) return v;
  if (/^(IN_?PROGRESS|EN_?COURS|WIP|DOING|ONGOING)(_|$)/.test(v)) return "IN_PROGRESS";
  if (/^(TO_?TEST|A_?TESTER|TESTING|TEST|IN_?TEST)(_|$)/.test(v)) return "TO_TEST";
  if (/^(TO_?CHECK|A_?VERIFIER|CK|TO_?CLARIFY)(_|$)/.test(v)) return "TO_CHECK";
  if (/^(TO_?DO|A_?FAIRE|BACKLOG|OPEN)(_|$)/.test(v)) return "TODO";
  if (/^(DONE|FAIT|TERMINE|CLOSED|CLOS|MERGED|SHIPPED|LIVRE)(_|$)/.test(v)) return "DONE";
  if (/^(SUPERSEDED|REMPLACE|OBSOLETE|ABANDONNE|DROPPED|CANCELLED|ANNULE)(_|$)/.test(v)) return "SUPERSEDED";
  return null;
}

function tableCells(line) {
  const t = line.trim();
  if (t.charAt(0) !== "|") return [];
  return t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

// kanban markdown → { ID: STATUS }. Tolère plusieurs tables, des colonnes en plus,
// et les en-têtes FR comme EN. Les lignes de gabarit (cellules vides) sont ignorées.
function parseKanbanStatuses(md) {
  const out = {};
  if (!md) return out;
  let map = null;
  for (const line of md.split("\n")) {
    if (line.trim().charAt(0) !== "|") { map = null; continue; }
    const cs = tableCells(line);
    const lo = cs.map((c) => c.toLowerCase());
    if (lo.indexOf("status") >= 0 && (lo.indexOf("titre") >= 0 || lo.indexOf("title") >= 0)) {
      map = { status: lo.indexOf("status"), id: lo.indexOf("id") };
      continue;
    }
    if (/^\|[\s|:-]*\|?$/.test(line.trim()) || !map || map.id < 0) continue;
    const id = String(cs[map.id] || "").replace(/`/g, "").trim();
    const st = canonStatus(cs[map.status]);
    if (!id || id === "—" || !st) continue;
    out[id] = st;
  }
  return out;
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; }
}

// Compare l'état courant du kanban (vivant + archive) au dernier instantané connu et
// append une ligne JSONL par transition. Retourne sans rien lire si aucun des deux
// fichiers n'a bougé (mtime + taille) — le hook tourne après chaque outil, il doit
// rester quasi gratuit.
function collectKanbanTransitions(projectDir, dir, ts) {
  const sources = [
    path.join(projectDir, "memory", "kanban.md"),
    path.join(projectDir, "memory", "archive", "kanban.md"),
  ];
  const sig = sources.map((f) => {
    try { const st = fs.statSync(f); return st.mtimeMs + ":" + st.size; } catch (_) { return "0:0"; }
  }).join("|");
  if (sig === "0:0|0:0") return; // pas de kanban : projet non initialisé

  const stateFile = path.join(dir, "kanban-state.json");
  const prev = readJson(stateFile, null);
  if (prev && prev.sig === sig) return; // rien n'a bougé

  let md = "";
  for (const f of sources) {
    try { md += fs.readFileSync(f, "utf8") + "\n"; } catch (_) {}
  }
  const now = parseKanbanStatuses(md);

  // Premier passage (ou instantané vide, p. ex. après une perte de `.ailed/`) : on
  // enregistre la ligne de base sans inventer de transitions — dater aujourd'hui la
  // création d'un ticket fini il y a trois semaines serait un mensonge.
  if (!prev || !prev.tickets || !Object.keys(prev.tickets).length) {
    writeJsonSafe(stateFile, { sig, tickets: now, since: ts });
    return;
  }

  // Statuts par lesquels un ticket entre réellement dans le kanban. Un ticket qu'on
  // découvre déjà `IN_PROGRESS`/`DONE` n'a pas été créé maintenant : on l'a simplement
  // jamais vu (archive relue, instantané perdu). On l'adopte dans l'instantané sans
  // le dater, plutôt que de fabriquer un événement faux.
  const ENTRY = new Set(["TO_CHECK", "TODO"]);
  const lines = [];
  for (const id of Object.keys(now)) {
    const from = prev.tickets[id] || null;
    if (from === now[id]) continue;
    if (!from && !ENTRY.has(now[id])) continue;
    lines.push(JSON.stringify({ ts, id, from, to: now[id] }));
  }
  if (lines.length) {
    try { fs.appendFileSync(path.join(dir, "journal.jsonl"), lines.join("\n") + "\n"); }
    catch (_) {}
  }
  writeJsonSafe(stateFile, { sig, tickets: now, since: (prev && prev.since) || ts });
}

function writeJsonSafe(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  } catch (_) {}
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch (_) {
    return "";
  }
}

function readState(file) {
  let state = { running: [], history: [], workflow: null, lastTool: null, updated: null };
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      state = Object.assign(state, parsed);
      if (!Array.isArray(state.running)) state.running = [];
      if (!Array.isArray(state.history)) state.history = [];
    }
  } catch (_) {
    /* corrupt file — start fresh */
  }
  return state;
}

function writeState(dir, file, state) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  } catch (_) {
    /* best-effort */
  }
}

function main() {
  const raw = readStdin();
  let payload = {};
  try {
    payload = JSON.parse(raw || "{}");
  } catch (_) {
    return; // not JSON — nothing to do
  }

  const projectDir = payload.cwd || process.cwd();
  const dir = path.join(projectDir, ".ailed");
  const file = path.join(dir, "runtime.json");
  const ts = new Date().toISOString();

  // Non-Task tools (Edit/Bash/Read/Grep…) = main-loop activity. Record the last
  // tool touched so the sidebar has a live heartbeat even when no ailed-* subagent
  // is running. Pre-phase only, to avoid doubling node spawns on every tool call.
  // Toute fin d'outil est un point de contrôle du kanban : un ticket peut avoir changé
  // de statut via Edit, Write ou un sed lancé en Bash — on compare l'état du fichier,
  // pas l'outil qui l'a écrit.
  if (phase === "post") collectKanbanTransitions(projectDir, dir, ts);

  if (payload.tool_name !== "Task") {
    if (phase !== "pre") return;
    const state = readState(file);
    state.lastTool = { tool: String(payload.tool_name || "").slice(0, 40), at: ts };
    state.updated = ts;
    writeState(dir, file, state);
    return;
  }

  const input = payload.tool_input || {};
  const agent = String(input.subagent_type || "").trim();
  if (!agent) return; // Task without a subagent type — nothing to track

  const state = readState(file);
  const desc = String(input.description || "").slice(0, 120);
  let nudge = null; // /clear suggestion banner, set when we reach a task boundary

  if (phase === "pre") {
    // mark agent as running (most-recent first), no duplicates
    state.running = state.running.filter((r) => r.agent !== agent);
    state.running.unshift({ agent, desc, since: ts });
    if (WORKFLOW_OF[agent]) state.workflow = WORKFLOW_OF[agent];
    state.clearSuggested = false; // a new agent started → re-arm the suggestion
  } else {
    // post: agent finished → move from running to history
    state.running = state.running.filter((r) => r.agent !== agent);
    state.history.push({ agent, desc, at: ts });
    if (state.history.length > 50) state.history = state.history.slice(-50);

    // Task boundary = nothing else running + not already nudged. Two flavors:
    // a workflow capstone (whole workflow done) or a ticket boundary (one MR done).
    if (state.running.length === 0 && !state.clearSuggested) {
      if (TERMINAL_OF[agent]) {
        nudge =
          `AI-Led ✓ "${TERMINAL_OF[agent]}" workflow complete — consider /clear ` +
          `before the next task (project state is saved in memory/).`;
        state.clearSuggested = true;
      } else if (TICKET_BOUNDARY.has(agent)) {
        nudge =
          `AI-Led ✓ ticket done (MR opened) — consider /clear before the next ticket; ` +
          `reload context from memory/ (long sessions cost tokens even when cached).`;
        state.clearSuggested = true;
      }
    }
  }

  state.updated = ts;
  writeState(dir, file, state);

  // Nudge the user to /clear at the workflow boundary. systemMessage shows a
  // banner and costs no model tokens; we deliberately do NOT inject
  // additionalContext (it would double-nudge and add context — the opposite of
  // what /clear is for).
  if (nudge) {
    try {
      process.stdout.write(JSON.stringify({ systemMessage: nudge }));
    } catch (_) {
      /* best-effort */
    }
  }
}

try {
  main();
} catch (_) {
  /* never disrupt Claude Code */
}
process.exit(0);
