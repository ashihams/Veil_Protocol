import type { SigningKey } from '@midnight-ntwrk/compact-runtime';
import type { ContractAddress } from '@midnight-ntwrk/ledger-v7';
import { type PrivateStateId, type PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

export const inMemoryPrivateStateProvider = <PSI extends PrivateStateId, PS>(): PrivateStateProvider<PSI, PS> => {
  const record = new Map<PSI, PS>();
  const signingKeys = {} as Record<ContractAddress, SigningKey>;

  return {
    set(key: PSI, state: PS): Promise<void> {
      record.set(key, state);
      return Promise.resolve();
    },
    get(key: PSI): Promise<PS | null> {
      const value = record.get(key) ?? null;
      return Promise.resolve(value);
    },
    remove(key: PSI): Promise<void> {
      record.delete(key);
      return Promise.resolve();
    },
    clear(): Promise<void> {
      record.clear();
      return Promise.resolve();
    },
    setSigningKey(contractAddress: ContractAddress, signingKey: SigningKey): Promise<void> {
      signingKeys[contractAddress] = signingKey;
      return Promise.resolve();
    },
    getSigningKey(contractAddress: ContractAddress): Promise<SigningKey | null> {
      const value = signingKeys[contractAddress] ?? null;
      return Promise.resolve(value);
    },
    removeSigningKey(contractAddress: ContractAddress): Promise<void> {
      delete signingKeys[contractAddress];
      return Promise.resolve();
    },
    clearSigningKeys(): Promise<void> {
      Object.keys(signingKeys).forEach((contractAddress) => {
        delete signingKeys[contractAddress];
      });
      return Promise.resolve();
    },
  };
};
