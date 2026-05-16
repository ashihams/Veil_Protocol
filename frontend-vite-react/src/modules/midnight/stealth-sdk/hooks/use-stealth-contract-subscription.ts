import { StealthDerivedState } from '../api/stealth-common-types';
import { useCallback, useEffect, useState } from 'react';
import { StealthContractControllerInterface } from '../api/stealthContractController';
import { Observable } from 'rxjs';
import { useWallet } from '../../wallet-widget/hooks/useWallet';
import {
  type StealthContractDeployment,
  type StealthContractFollow,
} from '../contexts/stealth-deployment-class';
import { useStealthDeployedContracts } from './use-stealth-deployment';
import { useStealthProviders } from './use-stealth-providers';

export const useStealthContractSubscription = () => {
  const { status } = useWallet();
  const providers = useStealthProviders();
  const deploy = useStealthDeployedContracts();

  const [stealthDeploymentObservable, setStealthDeploymentObservable] = useState<
    Observable<StealthContractDeployment> | undefined
  >(undefined);
  const [contractDeployment, setContractDeployment] = useState<StealthContractDeployment>();
  const [deployedContractAPI, setDeployedContractAPI] = useState<StealthContractControllerInterface>();
  const [derivedState, setDerivedState] = useState<StealthDerivedState>();

  const onDeploy = async (): Promise<StealthContractFollow> => deploy.deployContract();

  const onJoin = useCallback(async (): Promise<void> => {
    setStealthDeploymentObservable(deploy.joinContract().observable);
  }, [deploy]);

  useEffect(() => {
    if (status?.status === 'connected' && providers) {
      void onJoin();
    }
  }, [onJoin, status?.status, providers]);

  useEffect(() => {
    if (!stealthDeploymentObservable) return;
    const sub = stealthDeploymentObservable.subscribe(setContractDeployment);
    return () => sub.unsubscribe();
  }, [stealthDeploymentObservable]);

  useEffect(() => {
    if (!contractDeployment) return;
    if (contractDeployment.status === 'in-progress' || contractDeployment.status === 'failed') return;
    setDeployedContractAPI((prev) => prev || contractDeployment.api);
  }, [contractDeployment]);

  useEffect(() => {
    if (!deployedContractAPI) return;
    const sub = deployedContractAPI.state$.subscribe(setDerivedState);
    return () => sub.unsubscribe();
  }, [deployedContractAPI]);

  return {
    deployedContractAPI,
    derivedState,
    onDeploy,
    providers,
  };
};
