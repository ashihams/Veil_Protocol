/**
 * Deploy all Veil Protocol (agent + stealth) Compact contracts to Midnight preview (or preprod) in one run.
 * Uses midnight-js wallet + `deployContract` flow.
 *
 * Run from repo root: npx tsx scripts/deploy-all.ts
 * Config: copy scripts/.env.template → scripts/.env
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import dotenv from "dotenv";
import pino from "pino";

import type { Config } from "./midnight-config.js";
import * as wallet from "./midnight-wallet.js";
import { createPrivateState } from "../agent-contract/src/witnesses.js";
import * as Identity from "../agent-contract/src/managed/identity/contract/index.js";
import * as Reputation from "../agent-contract/src/managed/reputation/contract/index.js";
import * as Validation from "../agent-contract/src/managed/validation/contract/index.js";
import * as StealthKeyRegistry from "../stealth-contract/src/managed/stealth-key-registry/contract/index.js";
import * as StealthSend from "../stealth-contract/src/managed/stealth-send/contract/index.js";
import * as AnnouncementLog from "../stealth-contract/src/managed/announcement-log/contract/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(__dirname, ".env") });

type DeployableContract = {
  compactName: string;
  label: string;
  displayKey:
    | "identityRegistry"
    | "reputationRegistry"
    | "validationRegistry"
    | "stealthKeyRegistry"
    | "stealthSend"
    | "announcementLog";
  /** Compact `Contract` class from `compact compile` managed output. */
  Contract: any;
  zkDir: string;
  privateStateId: string;
  dbSuffix: string;
};

const STEPS: DeployableContract[] = [
  {
    compactName: "identity",
    label: "Identity Registry",
    displayKey: "identityRegistry",
    Contract: Identity.Contract,
    zkDir: path.join(repoRoot, "agent-contract/src/managed/identity"),
    privateStateId: "identityPrivateState",
    dbSuffix: "identity",
  },
  {
    compactName: "reputation",
    label: "Reputation Registry",
    displayKey: "reputationRegistry",
    Contract: Reputation.Contract,
    zkDir: path.join(repoRoot, "agent-contract/src/managed/reputation"),
    privateStateId: "reputationPrivateState",
    dbSuffix: "reputation",
  },
  {
    compactName: "validation",
    label: "Validation Registry",
    displayKey: "validationRegistry",
    Contract: Validation.Contract,
    zkDir: path.join(repoRoot, "agent-contract/src/managed/validation"),
    privateStateId: "validationPrivateState",
    dbSuffix: "validation",
  },
  {
    compactName: "stealth-key-registry",
    label: "Stealth Key Registry",
    displayKey: "stealthKeyRegistry",
    Contract: StealthKeyRegistry.Contract,
    zkDir: path.join(repoRoot, "stealth-contract/src/managed/stealth-key-registry"),
    privateStateId: "stealthKeyRegistryPrivateState",
    dbSuffix: "stealth-key-registry",
  },
  {
    compactName: "stealth-send",
    label: "Stealth Send",
    displayKey: "stealthSend",
    Contract: StealthSend.Contract,
    zkDir: path.join(repoRoot, "stealth-contract/src/managed/stealth-send"),
    privateStateId: "stealthSendPrivateState",
    dbSuffix: "stealth-send",
  },
  {
    compactName: "announcement-log",
    label: "Announcement Log",
    displayKey: "announcementLog",
    Contract: AnnouncementLog.Contract,
    zkDir: path.join(repoRoot, "stealth-contract/src/managed/announcement-log"),
    privateStateId: "announcementLogPrivateState",
    dbSuffix: "announcement-log",
  },
];

function networkFromEnv(): { id: "preview" | "preprod"; config: Config } {
  const raw = (process.env.MIDNIGHT_NETWORK || "preview").toLowerCase();
  const id = raw === "preprod" ? "preprod" : "preview";
  setNetworkId(id);

  const logDir = path.join(repoRoot, "logs", "deploy-all", `${new Date().toISOString().replace(/:/g, "-")}.log`);

  if (id === "preprod") {
    return {
      id,
      config: {
        logDir,
        indexer: process.env.INDEXER_HTTP || "https://indexer.preprod.midnight.network/api/v3/graphql",
        indexerWS: process.env.INDEXER_WS || "wss://indexer.preprod.midnight.network/api/v3/graphql/ws",
        node: process.env.NODE_URL || "https://rpc.preprod.midnight.network",
        proofServer:
          process.env.PROOF_SERVER_URL || "https://proof-server.preprod.midnight.network",
      },
    };
  }

  return {
    id,
    config: {
      logDir,
      indexer: process.env.INDEXER_HTTP || "https://indexer.preview.midnight.network/api/v3/graphql",
      indexerWS: process.env.INDEXER_WS || "wss://indexer.preview.midnight.network/api/v3/graphql/ws",
      node: process.env.NODE_URL || "https://rpc.preview.midnight.network",
      proofServer:
        process.env.PROOF_SERVER_URL || "https://proof-server.preview.midnight.network",
    },
  };
}

function padLabel(label: string, width: number): string {
  return label.length >= width ? label : label + " ".repeat(width - label.length);
}

/** Configure midnight-js providers for one contract (ZK dir + LevelDB namespace). */
async function configureProvidersForContract(
  walletContext: wallet.WalletContext,
  net: Config,
  zkAssetsDir: string,
  dbSuffix: string,
) {
  const walletAndMidnightProvider = await wallet.createWalletAndMidnightProvider(walletContext);
  const zkConfigProvider = new NodeZkConfigProvider(zkAssetsDir);
  return {
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: `midnight-edda-deploy-${dbSuffix}`,
      privateStateStoreName: `edda-private-state-${dbSuffix}`,
      signingKeyStoreName: `edda-signing-keys-${dbSuffix}`,
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(net.indexer, net.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(net.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
}

async function main(): Promise<void> {
  const logger = pino({ level: "info" });
  wallet.setLogger(logger);

  const { id: networkId, config: net } = networkFromEnv();

  let seedHex = process.env.WALLET_SEED?.trim() ?? "";
  if (!seedHex) {
    throw new Error("WALLET_SEED is required in scripts/.env");
  }
  if (seedHex.includes(" ")) {
    seedHex = await wallet.mnemonicToSeed(seedHex);
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("🚀 Deploying Veil Protocol contracts to Midnight");
  console.log("═══════════════════════════════════════════════════");
  console.log(`MIDNIGHT_NETWORK=${networkId}  ·  indexer / proof server below`);
  console.log(`Indexer: ${net.indexer}`);
  console.log(`Proof server: ${net.proofServer}`);
  console.log("");

  const walletCtx = await wallet.buildWalletAndWaitForFunds(net, seedHex);

  const addresses: Record<string, string> = {};
  const labelWidth = 34;

  try {
    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i]!;
      const n = i + 1;
      const prefix = `[${n}/6]`;
      process.stdout.write(`${prefix} ${padLabel(step.label + "...", labelWidth)}`);

      const providers = await configureProvidersForContract(walletCtx, net, step.zkDir, step.dbSuffix);
      const compiledContract = CompiledContract.make(step.compactName, step.Contract).pipe(
        CompiledContract.withVacantWitnesses,
        CompiledContract.withCompiledFileAssets(step.zkDir),
      );

      const deployed = await deployContract(
        providers as any,
        {
          compiledContract,
          privateStateId: step.privateStateId,
          initialPrivateState: createPrivateState(0),
        } as any,
      );

      const addr = deployed.deployTxData.public.contractAddress;
      addresses[step.displayKey] = addr;
      console.log(`✅ ${addr}`);
    }
  } finally {
    await wallet.closeWallet(walletCtx);
  }

  const outPath = path.join(__dirname, "deployments.json");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        network: networkId,
        deployedAt: new Date().toISOString(),
        proofServer: net.proofServer,
        contracts: addresses,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("✅ All 6 contracts deployed!");
  console.log("");
  console.log("Add to frontend-vite-react/.env:");
  console.log(`VITE_IDENTITY_REGISTRY_ADDRESS=${addresses.identityRegistry}`);
  console.log(`VITE_REPUTATION_REGISTRY_ADDRESS=${addresses.reputationRegistry}`);
  console.log(`VITE_VALIDATION_REGISTRY_ADDRESS=${addresses.validationRegistry}`);
  console.log(`VITE_STEALTH_KEY_REGISTRY_ADDRESS=${addresses.stealthKeyRegistry}`);
  console.log(`VITE_STEALTH_SEND_ADDRESS=${addresses.stealthSend}`);
  console.log(`VITE_ANNOUNCEMENT_LOG_ADDRESS=${addresses.announcementLog}`);
  console.log("");
  console.log("Saved to scripts/deployments.json");
  console.log("═══════════════════════════════════════════════════");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
