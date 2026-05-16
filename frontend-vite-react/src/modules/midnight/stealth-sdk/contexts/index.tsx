import { type Logger } from 'pino';
import { StealthProvidersWrapper } from './stealth-providers';
import { StealthDeployedProvider } from './stealth-deployment';
import { ContractAddress } from '@midnight-ntwrk/compact-runtime';

interface StealthAppProviderProps {
  children: React.ReactNode;
  logger: Logger;
  contractAddress: ContractAddress;
}

/**
 * Uses the same LocalStorageProvider as CounterAppProvider (must be nested inside it).
 */
export const StealthAppProvider = ({ children, logger, contractAddress }: StealthAppProviderProps) => {
  return (
    <StealthProvidersWrapper logger={logger}>
      <StealthDeployedProvider logger={logger} contractAddress={contractAddress}>
        {children}
      </StealthDeployedProvider>
    </StealthProvidersWrapper>
  );
};

export * from './stealth-deployment';
export * from './stealth-deployment-class';
