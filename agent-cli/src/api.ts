import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import * as bip39 from '@scure/bip39';
import { wordlist as english } from '@scure/bip39/wordlists/english.js';

import { type Config, contractConfig } from './config.js';
import {
  IdentityCircuits, IdentityPrivateStateId, IdentityProviders, DeployedIdentityContract,
  ReputationCircuits, ReputationPrivateStateId, ReputationProviders, DeployedReputationContract,
  ValidationCircuits, ValidationPrivateStateId, ValidationProviders, DeployedValidationContract,
} from './common-types.js';

import { IdentityContract, ReputationContract, ValidationContract } from '@eddalabs/agent-contract';
import type { AgentPrivateState } from '@eddalabs/agent-contract';
import { createPrivateState } from '@eddalabs/agent-contract';

import * as ledger from '@midnight-ntwrk/ledger-v7';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { toHex } from '@midnight-ntwrk/midnight-js-utils';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import {
  createKeystore, InMemoryTransactionHistoryStorage,
  type UnshieldedKeystore, UnshieldedWallet, PublicKey,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { generateRandomSeed, HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import {
  MidnightBech32m, ShieldedAddress, ShieldedCoinPublicKey, ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';

// @ts-expect-error: needed for WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

// ── Pre-compiled contracts ────────────────────────────────────────────────────

const identityCompiledContract = CompiledContract.make('identity', IdentityContract.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath.identity),
);

const reputationCompiledContract = CompiledContract.make('reputation', ReputationContract.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath.reputation),
);

const validationCompiledContract = CompiledContract.make('validation', ValidationContract.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath.validation),
);

// ── Wallet context ────────────────────────────────────────────────────────────

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

export const mnemonicToSeed = async (mnemonic: string): Promise<string> => {
  const words = mnemonic.trim().split(/\s+/);
  if (!bip39.validateMnemonic(words.join(' '), english)) {
    throw new Error('Invalid mnemonic phrase');
  }
  const seed = await bip39.mnemonicToSeed(words.join(' '));
  return Buffer.from(seed).subarray(0, 32).toString('hex');
};

const deriveKeysFromSeed = (seed: string) => {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet from seed');
  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derivationResult.type !== 'keysDerived') throw new Error('Failed to derive keys');
  hdWallet.hdWallet.clear();
  return derivationResult.keys;
};

const formatBalance = (b: bigint) => b.toLocaleString();

export const withStatus = async <T>(message: string, fn: () => Promise<T>): Promise<T> => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const iv = setInterval(() => process.stdout.write(`\r  ${frames[i++ % frames.length]} ${message}`), 80);
  try {
    const r = await fn();
    clearInterval(iv);
    process.stdout.write(`\r  ✓ ${message}\n`);
    return r;
  } catch (e) {
    clearInterval(iv);
    process.stdout.write(`\r  ✗ ${message}\n`);
    throw e;
  }
};

const buildShieldedConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const buildUnshieldedConfig = ({ indexer, indexerWS }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
});

const buildDustConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const signTransactionIntents = (
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof',
): void => {
  if (!tx.intents || tx.intents.size === 0) return;
  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;
    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature', proofMarker, 'pre-binding', intent.serialize(),
    );
    const signature = signFn(cloned.signatureData(segment));
    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }
    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }
    tx.intents.set(segment, cloned);
  }
};

export const createWalletAndMidnightProvider = async (
  walletContext: WalletContext,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(walletContext.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey(): ledger.CoinPublicKey {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey(): ledger.EncPublicKey {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl) {
      const recipe = await walletContext.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletContext.shieldedSecretKeys, dustSecretKey: walletContext.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload: Uint8Array) => walletContext.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      return walletContext.wallet.finalizeRecipe(recipe);
    },
    async submitTx(tx: ledger.FinalizedTransaction) {
      return walletContext.wallet.submitTransaction(tx);
    },
  };
};

const waitForSync = (wallet: WalletFacade) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.tap((s) => console.log(`  Syncing... isSynced=${s.isSynced}`)),
      Rx.filter((s) => s.isSynced),
    ),
  );

const waitForFunds = (wallet: WalletFacade) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.filter((s) => s.isSynced),
      Rx.map((s) =>
        (s.unshielded?.balances[ledger.nativeToken().raw] ?? 0n) +
        (s.shielded?.balances[ledger.nativeToken().raw] ?? 0n),
      ),
      Rx.filter((b) => b > 0n),
    ),
  );

const registerForDustGeneration = async (wallet: WalletFacade, unshieldedKeystore: UnshieldedKeystore) => {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  if (state.dust.availableCoins.length > 0) {
    console.log(`  ✓ DUST available (${formatBalance(state.dust.walletBalance(new Date()))} DUST)`);
    return;
  }
  const nightUtxos = state.unshielded.availableCoins.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration !== true,
  );
  if (nightUtxos.length > 0) {
    await withStatus(`Registering ${nightUtxos.length} NIGHT UTXO(s) for dust generation`, async () => {
      const recipe = await wallet.registerNightUtxosForDustGeneration(
        nightUtxos, unshieldedKeystore.getPublicKey(),
        (payload) => unshieldedKeystore.signData(payload),
      );
      const finalized = await wallet.finalizeRecipe(recipe);
      await wallet.submitTransaction(finalized);
    });
  }
  await withStatus('Waiting for DUST to generate', () =>
    Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
      ),
    ),
  );
};

export const buildWalletAndWaitForFunds = async (config: Config, seed: string): Promise<WalletContext> => {
  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await withStatus(
    'Building wallet', async () => {
      const keys = deriveKeysFromSeed(seed);
      const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
      const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
      const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());
      const shieldedWallet = ShieldedWallet(buildShieldedConfig(config)).startWithSecretKeys(shieldedSecretKeys);
      const unshieldedWallet = UnshieldedWallet(buildUnshieldedConfig(config)).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore),
      );
      const dustWallet = DustWallet(buildDustConfig(config)).startWithSecretKey(
        dustSecretKey, ledger.LedgerParameters.initialParameters().dust,
      );
      const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
      await wallet.start(shieldedSecretKeys, dustSecretKey);
      return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
    },
  );

  const DIV = '──────────────────────────────────────────────────────────────';
  console.log(`\n${DIV}\n  Seed: ${seed}\n  Unshielded: ${unshieldedKeystore.getBech32Address()}\n${DIV}\n`);

  const syncedState = await withStatus('Syncing with network', () => waitForSync(wallet));

  const coinPubKey = ShieldedCoinPublicKey.fromHexString(syncedState.shielded.coinPublicKey.toHexString());
  const encPubKey = ShieldedEncryptionPublicKey.fromHexString(syncedState.shielded.encryptionPublicKey.toHexString());
  const shieldedAddress = MidnightBech32m.encode(getNetworkId(), new ShieldedAddress(coinPubKey, encPubKey)).toString();
  console.log(`  Shielded address: ${shieldedAddress}`);
  console.log(`  NIGHT balance: ${formatBalance(syncedState.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n)}`);

  const balance = syncedState.unshielded.balances[ledger.unshieldedToken().raw] ?? 0n;
  if (balance === 0n) {
    console.log(`\n  Fund your wallet at https://faucet.preview.midnight.network/\n  Address: ${unshieldedKeystore.getBech32Address()}\n`);
    await withStatus('Waiting for incoming tNIGHT', () => waitForFunds(wallet));
  }

  await registerForDustGeneration(wallet, unshieldedKeystore);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

export const buildFreshWallet = async (config: Config): Promise<WalletContext> =>
  buildWalletAndWaitForFunds(config, toHex(Buffer.from(generateRandomSeed())));

// ── Provider assembly ─────────────────────────────────────────────────────────

export const configureIdentityProviders = async (walletContext: WalletContext, config: Config): Promise<IdentityProviders> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(walletContext);
  const zkConfigProvider = new NodeZkConfigProvider<IdentityCircuits>(contractConfig.zkConfigPath.identity);
  return {
    privateStateProvider: levelPrivateStateProvider<typeof IdentityPrivateStateId>({
      privateStateStoreName: contractConfig.privateStateStoreName + '-identity',
      signingKeyStoreName: 'signing-keys',
      midnightDbName: 'midnight-level-db',
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

export const configureReputationProviders = async (walletContext: WalletContext, config: Config): Promise<ReputationProviders> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(walletContext);
  const zkConfigProvider = new NodeZkConfigProvider<ReputationCircuits>(contractConfig.zkConfigPath.reputation);
  return {
    privateStateProvider: levelPrivateStateProvider<typeof ReputationPrivateStateId>({
      privateStateStoreName: contractConfig.privateStateStoreName + '-reputation',
      signingKeyStoreName: 'signing-keys',
      midnightDbName: 'midnight-level-db',
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

export const configureValidationProviders = async (walletContext: WalletContext, config: Config): Promise<ValidationProviders> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(walletContext);
  const zkConfigProvider = new NodeZkConfigProvider<ValidationCircuits>(contractConfig.zkConfigPath.validation);
  return {
    privateStateProvider: levelPrivateStateProvider<typeof ValidationPrivateStateId>({
      privateStateStoreName: contractConfig.privateStateStoreName + '-validation',
      signingKeyStoreName: 'signing-keys',
      midnightDbName: 'midnight-level-db',
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

// ── Deploy / Join ─────────────────────────────────────────────────────────────

const initialPrivateState: AgentPrivateState = createPrivateState(0);

export const deployIdentity = async (providers: IdentityProviders): Promise<DeployedIdentityContract> => {
  console.log('  Deploying Identity registry...');
  const contract = await deployContract(providers, {
    compiledContract: identityCompiledContract,
    privateStateId: IdentityPrivateStateId,
    initialPrivateState,
  });
  console.log(`  ✓ Identity deployed at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const deployReputation = async (providers: ReputationProviders): Promise<DeployedReputationContract> => {
  console.log('  Deploying Reputation registry...');
  const contract = await deployContract(providers, {
    compiledContract: reputationCompiledContract,
    privateStateId: ReputationPrivateStateId,
    initialPrivateState,
  });
  console.log(`  ✓ Reputation deployed at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const deployValidation = async (providers: ValidationProviders): Promise<DeployedValidationContract> => {
  console.log('  Deploying Validation registry...');
  const contract = await deployContract(providers, {
    compiledContract: validationCompiledContract,
    privateStateId: ValidationPrivateStateId,
    initialPrivateState,
  });
  console.log(`  ✓ Validation deployed at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const joinIdentity = async (
  providers: IdentityProviders, contractAddress: string,
): Promise<DeployedIdentityContract> => {
  const contract = await findDeployedContract(providers, {
    contractAddress, compiledContract: identityCompiledContract,
    privateStateId: IdentityPrivateStateId, initialPrivateState,
  });
  console.log(`  ✓ Joined Identity at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const joinReputation = async (
  providers: ReputationProviders, contractAddress: string,
): Promise<DeployedReputationContract> => {
  const contract = await findDeployedContract(providers, {
    contractAddress, compiledContract: reputationCompiledContract,
    privateStateId: ReputationPrivateStateId, initialPrivateState,
  });
  console.log(`  ✓ Joined Reputation at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const joinValidation = async (
  providers: ValidationProviders, contractAddress: string,
): Promise<DeployedValidationContract> => {
  const contract = await findDeployedContract(providers, {
    contractAddress, compiledContract: validationCompiledContract,
    privateStateId: ValidationPrivateStateId, initialPrivateState,
  });
  console.log(`  ✓ Joined Validation at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

export const closeWallet = async (walletContext: WalletContext) => {
  try { await walletContext.wallet.stop(); } catch { /* ignore */ }
};
