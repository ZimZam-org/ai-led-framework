#!/usr/bin/env node
"use strict";

/*
 * AI-Led runtime hook — feeds the `ai-led watch` progress sidebar.
 *
 * Installed into the target project at .claude/hooks/ailed-runtime-hook.js and
 * wired in .claude/settings.json on the `Task` tool:
 *   PreToolUse  → node .claude/hooks/ailed-runtime-hook.js pre
 *   PostToolUse → node .claude/hooks/ailed-runtime-hook.js post
 *
 * It reads the hook payload (JSON) on stdin, and when the tool is `Task` with a
 * subagent_type prefixed `ailed-`, records which agent is running / has finished
 * into <project>/.ailed/runtime.json. Strictly best-effort: it never throws and
 * always exits 0 so it can never disrupt Claude Code.
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

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch (_) {
    return "";
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

  if (payload.tool_name !== "Task") return;
  const input = payload.tool_input || {};
  const agent = String(input.subagent_type || "").trim();
  if (!agent || !/^ailed-/.test(agent)) return;

  const projectDir = payload.cwd || process.cwd();
  const dir = path.join(projectDir, ".ailed");
  const file = path.join(dir, "runtime.json");

  let state = { running: [], history: [], workflow: null, updated: null };
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

  const ts = new Date().toISOString();
  const desc = String(input.description || "").slice(0, 120);

  if (phase === "pre") {
    // mark agent as running (most-recent first), no duplicates
    state.running = state.running.filter((r) => r.agent !== agent);
    state.running.unshift({ agent, desc, since: ts });
    if (WORKFLOW_OF[agent]) state.workflow = WORKFLOW_OF[agent];
  } else {
    // post: agent finished → move from running to history
    state.running = state.running.filter((r) => r.agent !== agent);
    state.history.push({ agent, desc, at: ts });
    if (state.history.length > 50) state.history = state.history.slice(-50);
  }

  state.updated = ts;

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  } catch (_) {
    /* best-effort */
  }
}

try {
  main();
} catch (_) {
  /* never disrupt Claude Code */
}
process.exit(0);
