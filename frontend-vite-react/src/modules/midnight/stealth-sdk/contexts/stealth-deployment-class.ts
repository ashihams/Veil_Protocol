import { type StealthProviders, StealthPrivateStateId } from '../api/stealth-common-types';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { BehaviorSubject } from 'rxjs';
import { type Logger } from 'pino';
import type { StealthLocalStorageProps } from './stealth-local-storage';
import {
  StealthContractController,
  StealthContractControllerInterface,
} from '../api/stealthContractController';

export type StealthContractDeployment =
  | StealthInProgressContractDeployment
  | StealthDeployedContract
  | StealthFailedContractDeployment;

export interface StealthInProgressContractDeployment {
  readonly status: 'in-progress';
  readonly address?: ContractAddress;
}

export interface StealthDeployedContract {
  readonly status: 'deployed';
  readonly api: StealthContractControllerInterface;
  readonly address: ContractAddress;
}

export interface StealthFailedContractDeployment {
  readonly status: 'failed';
  readonly error: Error;
  readonly address?: ContractAddress;
}

export interface StealthContractFollow {
  readonly observable: BehaviorSubject<StealthContractDeployment>;
  address?: ContractAddress;
}

export interface StealthDeployedAPIProvider {
  readonly joinContract: () => StealthContractFollow;
  readonly deployContract: () => Promise<StealthContractFollow>;
}

export class StealthDeployedTemplateManager implements StealthDeployedAPIProvider {
  constructor(
    private readonly logger: Logger,
    private readonly localState: StealthLocalStorageProps,
    private readonly contractAddress: ContractAddress,
    private readonly providers?: StealthProviders,
  ) {}

  joinContract(): StealthContractFollow {
    const deployment = new BehaviorSubject<StealthContractDeployment>({
      status: 'in-progress',
      address: this.contractAddress,
    });
    const contractFollow = {
      observable: deployment,
      address: this.contractAddress,
    };
    void this.join(deployment, this.contractAddress);
    return contractFollow;
  }

  async deployContract(): Promise<StealthContractFollow> {
    const deployment = new BehaviorSubject<StealthContractDeployment>({
      status: 'in-progress',
    });
    const address = await this.deploy(deployment);
    return { observable: deployment, address };
  }

  private async deploy(
    deployment: BehaviorSubject<StealthContractDeployment>,
  ): Promise<string | undefined> {
    try {
      if (this.providers) {
        const api = await StealthContractController.deploy(
          StealthPrivateStateId,
          this.providers,
          this.logger,
        );
        this.localState.addStealthContract(api.deployedContractAddress);
        deployment.next({
          status: 'deployed',
          api,
          address: api.deployedContractAddress,
        });
        return api.deployedContractAddress;
      }
      deployment.next({
        status: 'failed',
        error: new Error('Providers are not available'),
      });
    } catch (error: unknown) {
      this.logger.error(error);
      deployment.next({
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
    return undefined;
  }

  private async join(
    deployment: BehaviorSubject<StealthContractDeployment>,
    contractAddress: ContractAddress,
  ): Promise<void> {
    try {
      if (this.providers) {
        const api = await StealthContractController.join(
          StealthPrivateStateId,
          this.providers,
          contractAddress,
          this.logger,
        );
        deployment.next({
          status: 'deployed',
          api,
          address: api.deployedContractAddress,
        });
      } else {
        deployment.next({
          status: 'failed',
          error: new Error('Providers are not available'),
        });
      }
    } catch (error: unknown) {
      this.logger.error(error);
      deployment.next({
        status: 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }
}
