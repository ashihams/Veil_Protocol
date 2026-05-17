import { useContext } from 'react';
import {
  StealthDeployedProviderContext,
} from '../contexts/stealth-deployment';
import type { StealthDeployedAPIProvider } from '../contexts/stealth-deployment-class';

export const useStealthDeployedContracts = (): StealthDeployedAPIProvider => {
  const context = useContext(StealthDeployedProviderContext);
  if (!context) {
    throw new Error('Stealth deployment context required.');
  }
  return context;
};
