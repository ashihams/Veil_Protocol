import { useContext } from 'react';
import { StealthLocalStorageContext, type StealthLocalStorageProps } from '../contexts/stealth-local-storage';

export const useStealthLocalState = (): StealthLocalStorageProps => {
  const context = useContext(StealthLocalStorageContext);
  if (!context) {
    throw new Error('useStealthLocalState must be used inside StealthLocalStorageProvider');
  }
  return context;
};
