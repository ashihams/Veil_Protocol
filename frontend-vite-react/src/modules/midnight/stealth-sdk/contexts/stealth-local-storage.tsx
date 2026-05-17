import type { Logger } from 'pino';
import type { ReactNode } from 'react';
import { createContext, useMemo } from 'react';

export interface StealthLocalStorageProps {
  readonly addStealthContract: (contract: string) => void;
  readonly getStealthContracts: () => string[];
}

export class StealthLocalStorage implements StealthLocalStorageProps {
  constructor(private readonly logger: Logger) {}

  addStealthContract(contract: string): void {
    this.logger.trace(`Adding stealth contract ${contract}`);
    const item = window.localStorage.getItem('stealth_contracts');
    const contracts: string[] = item ? JSON.parse(item) : [];
    const updated = Array.from(new Set([...contracts, contract]));
    window.localStorage.setItem('stealth_contracts', JSON.stringify(updated));
  }

  getStealthContracts(): string[] {
    const item = window.localStorage.getItem('stealth_contracts');
    const contracts: string[] = item ? JSON.parse(item) : [];
    return Array.from<string>(new Set([...contracts]));
  }
}

export const StealthLocalStorageContext = createContext<StealthLocalStorageProps | undefined>(undefined);

export interface StealthLocalStorageProviderProps {
  children: ReactNode;
  logger: Logger;
}

export const StealthLocalStorageProvider = ({ children, logger }: StealthLocalStorageProviderProps) => {
  const instance = useMemo(() => new StealthLocalStorage(logger), [logger]);

  return (
    <StealthLocalStorageContext.Provider value={instance}>{children}</StealthLocalStorageContext.Provider>
  );
};
