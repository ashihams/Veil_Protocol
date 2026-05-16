import type { Logger } from 'pino';

export interface LocalStorageProps {
  readonly addContract: (contract: string) => void;
  readonly getContracts: () => string[];
  readonly addStealthContract: (contract: string) => void;
  readonly getStealthContracts: () => string[];
}

export class LocalStorage implements LocalStorageProps {
  constructor(private readonly logger: Logger) {}

  addContract(contract: string): void {
    this.logger.trace(`Adding contract ${contract}`);
    const item = window.localStorage.getItem('counter_contracts');
    const contracts: string[] = item ? JSON.parse(item) : [];
    const updatedContracts = Array.from(new Set([...contracts, contract]));
    window.localStorage.setItem('counter_contracts', JSON.stringify(updatedContracts));
  }

  getContracts(): string[] {
    const item = window.localStorage.getItem('counter_contracts');
    const contracts: string[] = item ? JSON.parse(item) : [];
    return Array.from<string>(new Set([...contracts]));
  }

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
