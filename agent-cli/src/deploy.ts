/**
 * deploy.ts — Deploy all three ERC-8004 agent registries to Midnight Preview.
 *
 * Usage:
 *   1. Copy .env_template to .env and fill in MY_PREVIEW_MNEMONIC
 *   2. Ensure the local proof server is running: http://127.0.0.1:6300
 *   3. Run: npm run deploy-preview
 *
 * On success, prints contract addresses for Identity, Reputation, and Validation.
 * Save these addresses — you will need them to join the contracts later.
 */

import 'dotenv/config';
import { PreviewConfig } from './config.js';
import {
  mnemonicToSeed,
  buildWalletAndWaitForFunds,
  buildFreshWallet,
  configureIdentityProviders,
  configureReputationProviders,
  configureValidationProviders,
  deployIdentity,
  deployReputation,
  deployValidation,
  withStatus,
  closeWallet,
} from './api.js';

const DIV = '──────────────────────────────────────────────────────────────';

async function main() {
  console.log(`\n${DIV}`);
  console.log('  Veil Protocol — ERC-8004 Agent Registry Deploy');
  console.log('  Network: Midnight Preview');
  console.log(`${DIV}\n`);

  const config = new PreviewConfig();

  // ── Wallet setup ────────────────────────────────────────────────────────────
  let walletContext;
  const mnemonic = process.env.MY_PREVIEW_MNEMONIC?.trim();

  if (mnemonic) {
    console.log('Loading wallet from MY_PREVIEW_MNEMONIC...');
    const seed = await mnemonicToSeed(mnemonic);
    walletContext = await buildWalletAndWaitForFunds(config, seed);
  } else {
    console.log('No mnemonic found — generating a fresh wallet.');
    console.log('Save the seed phrase shown below and add it to .env as MY_PREVIEW_MNEMONIC\n');
    walletContext = await buildFreshWallet(config);
  }

  // ── Deploy contracts ────────────────────────────────────────────────────────
  console.log(`\n${DIV}`);
  console.log('  Deploying contracts');
  console.log(`${DIV}\n`);

  const [identityProviders, reputationProviders, validationProviders] = await Promise.all([
    configureIdentityProviders(walletContext, config),
    configureReputationProviders(walletContext, config),
    configureValidationProviders(walletContext, config),
  ]);

  const identityContract = await withStatus('Deploying Identity registry', () =>
    deployIdentity(identityProviders),
  );
  const reputationContract = await withStatus('Deploying Reputation registry', () =>
    deployReputation(reputationProviders),
  );
  const validationContract = await withStatus('Deploying Validation registry', () =>
    deployValidation(validationProviders),
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${DIV}`);
  console.log('  Deployment complete');
  console.log(`${DIV}`);
  console.log(`  Identity   : ${identityContract.deployTxData.public.contractAddress}`);
  console.log(`  Reputation : ${reputationContract.deployTxData.public.contractAddress}`);
  console.log(`  Validation : ${validationContract.deployTxData.public.contractAddress}`);
  console.log(`${DIV}\n`);
  console.log('  Save these addresses. Use them with joinIdentity/joinReputation/joinValidation');
  console.log('  to interact with the contracts after deployment.\n');

  await closeWallet(walletContext);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n  Deploy failed:', err);
  process.exit(1);
});
