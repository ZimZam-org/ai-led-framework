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
