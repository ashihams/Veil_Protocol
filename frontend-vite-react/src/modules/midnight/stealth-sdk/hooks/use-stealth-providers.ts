import { useContext } from 'react';
import { StealthProvidersContext, type StealthProvidersState } from '../contexts/stealth-providers';

export const useStealthProviders = (): StealthProvidersState | null => {
  const providerState = useContext(StealthProvidersContext);
  if (!providerState) {
    console.warn('[useStealthProviders] not ready yet.');
    return null;
  }
  return providerState;
};
