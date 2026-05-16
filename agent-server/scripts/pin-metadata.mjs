#!/usr/bin/env node
/**
 * pin-metadata.mjs — create AgentMetadata for the demo add-agent and pin to IPFS via Pinata.
 *
 * Usage: node agent-server/scripts/pin-metadata.mjs
 * Requires: PINATA_API_KEY and PINATA_API_SECRET in repo root .env
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

// ── load .env from repo root ──────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim())),
);

const PINATA_API_KEY = env.PINATA_API_KEY;
const PINATA_API_SECRET = env.PINATA_API_SECRET;

if (!PINATA_API_KEY || !PINATA_API_SECRET) {
  console.error("Missing PINATA_API_KEY or PINATA_API_SECRET in .env");
  process.exit(1);
}

// ── build AgentMetadata ───────────────────────────────────────────────────────
const metadata = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "Add Agent",
  description:
    "Computes add(a, b) tasks behind an x402 payment gate on Midnight Network. " +
    "Send POST /task with op:add, a, b — pay 1 DUST via HMAC-SHA256 proof to unlock the result.",
  active: true,
  x402Support: true,
  services: [
    {
      name: "web",
      endpoint: "http://localhost:3402",
      version: "1.0.0",
    },
  ],
  registrations: [
    {
      chain: "midnight:preview",
      registry: "0x0000000000000000000000000000000000000000",
      agentId: 1,
    },
  ],
  supportedTrust: ["reputation"],
};

// ── pin to Pinata ─────────────────────────────────────────────────────────────
const body = JSON.stringify({
  pinataContent: metadata,
  pinataMetadata: { name: "add-agent-metadata.json" },
});

function post(body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.pinata.cloud",
        path: "/pinning/pinJSONToIPFS",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_API_SECRET,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            resolve({ status: res.statusCode, data: JSON.parse(text) });
          } catch {
            reject(new Error(`Non-JSON response (${res.statusCode}): ${text}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

console.log("Pinning AgentMetadata to IPFS via Pinata...\n");
console.log(JSON.stringify(metadata, null, 2));
console.log();

const { status, data } = await post(body);

if (status !== 200 || !data.IpfsHash) {
  console.error("Pinata error:", data);
  process.exit(1);
}

console.log("✓ Pinned successfully");
console.log(`  CID        : ${data.IpfsHash}`);
console.log(`  agentURI   : ipfs://${data.IpfsHash}`);
console.log(`  Gateway URL: https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`);
