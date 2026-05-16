import type { PropsWithChildren } from 'react';
import { createContext, useMemo } from 'react';
import type { Logger } from 'pino';
import type { StealthDeployedAPIProvider } from './stealth-deployment-class';
import { useLocalState } from '../../counter-sdk/hooks/use-localStorage';
import { StealthDeployedTemplateManager } from './stealth-deployment-class';
import { ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { useStealthProviders } from '../hooks/use-stealth-providers';

export const StealthDeployedProviderContext = createContext<
  StealthDeployedAPIProvider | undefined
>(undefined);

export type StealthDeployedProviderProps = PropsWithChildren<{
  logger: Logger;
  contractAddress: ContractAddress;
}>;

export const StealthDeployedProvider = ({
  logger,
  contractAddress,
  children,
}: StealthDeployedProviderProps) => {
  const localState = useLocalState();
  const providers = useStealthProviders();
  const manager = useMemo(() => {
    return new StealthDeployedTemplateManager(
      logger,
      localState,
      contractAddress,
      providers?.providers,
    );
  }, [logger, localState, contractAddress, providers?.providers]);

  return (
    <StealthDeployedProviderContext.Provider value={manager}>{children}</StealthDeployedProviderContext.Provider>
  );
};
