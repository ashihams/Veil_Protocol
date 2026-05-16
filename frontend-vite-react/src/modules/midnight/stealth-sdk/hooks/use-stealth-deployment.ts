import { useContext } from 'react';
import {
  StealthDeployedProviderContext,
  type StealthDeployedAPIProvider,
} from '../contexts/stealth-deployment';

export const useStealthDeployedContracts = (): StealthDeployedAPIProvider => {
  const context = useContext(StealthDeployedProviderContext);
  if (!context) {
    throw new Error('Stealth deployment context required.');
  }
  return context;
};
