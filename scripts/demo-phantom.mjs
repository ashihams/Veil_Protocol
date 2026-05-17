#!/usr/bin/env node
/**
 * Phantom Protocol — quick demo runner.
 *
 * Runs the full stealth + x402 E2E test against a live agent-server.
 * Prerequisite: npm run dev:agent-server  (default http://localhost:3402)
 *
 * Usage: node scripts/demo-phantom.mjs
 *    or: npm run demo:phantom
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.AGENT_SERVER_URL ?? "http://localhost:3402").replace(/\/$/, "");
const taskUrl = `${base}/task`;

const banner = `
═══════════════════════════════════════════════════
  Phantom Protocol — stealth × x402 demo
═══════════════════════════════════════════════════
`;

async function serverReady() {
  try {
    const r = await fetch(taskUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "add", a: 1, b: 1 }),
    });
    return r.status === 402;
  } catch {
    return !!(process.env.PHANTOM_SKIP_SERVER_CHECK);
  }
}

console.log(banner);

const ok = await serverReady();
if (!ok) {
  console.error("Agent server not ready at", base);
  console.error("Start it in another terminal:  npm run dev:agent-server");
  console.error("Or set AGENT_SERVER_URL / PHANTOM_SKIP_SERVER_CHECK=1 to bypass this check.");
  process.exit(1);
}

console.log("Agent server OK (402 challenge). Running E2E…\n");

const e2e = spawnSync("npx", ["tsx", "stealth-contract/src/test-e2e.ts"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

process.exit(e2e.status ?? 1);
