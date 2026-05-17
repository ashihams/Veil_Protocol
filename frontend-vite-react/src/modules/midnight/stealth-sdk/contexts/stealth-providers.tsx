import * as ledger from '@midnight-ntwrk/ledger-v7';
import {
  type MidnightProvider,
  type WalletProvider,
  type UnboundTransaction,
  PrivateStateProvider,
  ZKConfigProvider,
  ProofProvider,
  PublicDataProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { createContext, useCallback, useMemo, useState } from 'react';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { Logger } from 'pino';
import type { StealthCircuits } from '../api/stealth-common-types';
import { StealthPrivateStateId, StealthProviders } from '../api/stealth-common-types';
import { StealthPrivateState } from '@eddalabs/stealth-contract';
import {
  ActionMessages,
  ProviderAction,
  WrappedPublicDataProvider,
} from '../utils/wrapped-public-data-provider';
import { CachedFetchZkConfigProvider } from '../utils/cached-zk-config-provider';
import { noopProofClient, proofClient } from '../utils/proof-client';
import { inMemoryPrivateStateProvider } from '../utils/in-memory-private-state-provider';

/** Default Preview indexer (override with VITE_MIDNIGHT_INDEXER_*). */
const DEFAULT_INDEXER_HTTP =
  import.meta.env.VITE_MIDNIGHT_INDEXER_HTTP ?? 'https://indexer.preview.midnight.network/api/v3/graphql';
const DEFAULT_INDEXER_WS =
  import.meta.env.VITE_MIDNIGHT_INDEXER_WS ??
  'wss://indexer.preview.midnight.network/api/v3/graphql/ws';
const PROVER_URL = import.meta.env.VITE_MIDNIGHT_PROVER_URL ?? '';

export interface StealthProvidersState {
  privateStateProvider: PrivateStateProvider<typeof StealthPrivateStateId>;
  zkConfigProvider?: ZKConfigProvider<StealthCircuits>;
  proofProvider: ProofProvider;
  publicDataProvider?: PublicDataProvider;
  walletProvider?: WalletProvider;
  midnightProvider?: MidnightProvider;
  providers?: StealthProviders;
  flowMessage?: string;
}

interface StealthProviderProps {
  children: React.ReactNode;
  logger: Logger;
}

export const StealthProvidersContext = createContext<StealthProvidersState | undefined>(undefined);

const ACTION_MESSAGES: Readonly<ActionMessages> = {
  proveTxStarted: 'Proving transaction...',
  proveTxDone: undefined,
  balanceTxStarted: 'Wallet not connected (read-only providers).',
  balanceTxDone: undefined,
  downloadProverStarted: 'Downloading prover key...',
  downloadProverDone: undefined,
  submitTxStarted: 'Submitting transaction...',
  submitTxDone: undefined,
  watchForTxDataStarted: 'Waiting for transaction finalization on blockchain...',
  watchForTxDataDone: undefined,
};

/**
 * Midnight indexer + ZK fetch for stealth Compact demos — no browser wallet / Lace UI.
 * Connect a wallet later by extending this provider if needed.
 */
export const StealthProvidersWrapper = ({ children, logger }: StealthProviderProps) => {
  const [flowMessage, setFlowMessage] = useState<string | undefined>(undefined);

  const providerCallback = useCallback((action: ProviderAction): void => {
    setFlowMessage(ACTION_MESSAGES[action]);
  }, []);

  const privateStateProvider: PrivateStateProvider<typeof StealthPrivateStateId> = useMemo(
    () => inMemoryPrivateStateProvider<string, StealthPrivateState>(),
    [],
  );

  const publicDataProvider: PublicDataProvider | undefined = useMemo(
    () =>
      new WrappedPublicDataProvider(
        indexerPublicDataProvider(DEFAULT_INDEXER_HTTP, DEFAULT_INDEXER_WS),
        providerCallback,
        logger,
      ),
    [providerCallback, logger],
  );

  const zkConfigProvider = useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return new CachedFetchZkConfigProvider<StealthCircuits>(
      `${window.location.origin}/midnight/stealth`,
      fetch.bind(window),
      () => {},
    );
  }, []);

  const proofProvider = useMemo(
    () =>
      PROVER_URL.trim() && zkConfigProvider
        ? proofClient(PROVER_URL.trim(), zkConfigProvider, providerCallback)
        : noopProofClient(),
    [zkConfigProvider, providerCallback],
  );

  const walletProvider: WalletProvider = useMemo(
    () => ({
      getCoinPublicKey(): ledger.CoinPublicKey {
        return '';
      },
      getEncryptionPublicKey(): ledger.EncPublicKey {
        return '';
      },
      balanceTx: () => Promise.reject(new Error('No wallet — use Veil Protocol x402 + local crypto demo, or add Lace here.')),
    }),
    [],
  );

  const midnightProvider: MidnightProvider = useMemo(
    () => ({
      submitTx: (): Promise<ledger.TransactionId> => Promise.reject(new Error('No wallet')),
    }),
    [],
  );

  const combinedProviders: StealthProvidersState = useMemo(() => {
    return {
      privateStateProvider,
      publicDataProvider,
      proofProvider,
      zkConfigProvider,
      walletProvider,
      midnightProvider,
      providers:
        publicDataProvider && zkConfigProvider
          ? {
              privateStateProvider,
              publicDataProvider,
              zkConfigProvider,
              proofProvider,
              walletProvider,
              midnightProvider,
            }
          : undefined,
      flowMessage,
    };
  }, [
    privateStateProvider,
    publicDataProvider,
    proofProvider,
    zkConfigProvider,
    walletProvider,
    midnightProvider,
    flowMessage,
  ]);

  return (
    <StealthProvidersContext.Provider value={combinedProviders}>{children}</StealthProvidersContext.Provider>
  );
};
