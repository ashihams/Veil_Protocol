import { type Logger } from 'pino';
import { StealthProvidersWrapper } from './stealth-providers';
import { StealthDeployedProvider } from './stealth-deployment';
import { StealthLocalStorageProvider } from './stealth-local-storage';
import { ContractAddress } from '@midnight-ntwrk/compact-runtime';

interface StealthAppProviderProps {
  children: React.ReactNode;
  logger: Logger;
  contractAddress: ContractAddress;
}

export const StealthAppProvider = ({ children, logger, contractAddress }: StealthAppProviderProps) => {
  return (
    <StealthProvidersWrapper logger={logger}>
      <StealthLocalStorageProvider logger={logger}>
        <StealthDeployedProvider logger={logger} contractAddress={contractAddress}>
          {children}
        </StealthDeployedProvider>
      </StealthLocalStorageProvider>
    </StealthProvidersWrapper>
  );
};

export * from './stealth-deployment';
export * from './stealth-deployment-class';
