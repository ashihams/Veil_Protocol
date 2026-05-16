import { type Logger } from 'pino';
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import * as Rx from 'rxjs';
import {
  StealthPrivateStateId,
  StealthProviders,
  DeployedStealthContract,
  stealthEmptyState,
  type StealthDerivedState,
  type StealthUserAction,
} from './stealth-common-types';
import {
  Stealth,
  StealthPrivateState,
  createPrivateState,
} from '@eddalabs/stealth-contract';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';
import { CompiledContract } from '@midnight-ntwrk/compact-js';

const stealthCompiledContract = CompiledContract.make('stealth', Stealth.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(`${window.location.origin}/midnight/stealth`),
);

export interface StealthContractControllerInterface {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Rx.Observable<StealthDerivedState>;
  increment: () => Promise<void>;
}

export class StealthContractController implements StealthContractControllerInterface {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Rx.Observable<StealthDerivedState>;
  readonly privateStates$: Rx.Subject<StealthPrivateState>;
  readonly turns$: Rx.Subject<StealthUserAction>;

  private constructor(
    public readonly contractPrivateStateId: typeof StealthPrivateStateId,
    public readonly deployedContract: DeployedStealthContract,
    public readonly providers: StealthProviders,
    private readonly logger: Logger,
  ) {
    const combine = (_acc: StealthDerivedState, value: StealthDerivedState): StealthDerivedState =>
      value;
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    this.turns$ = new Rx.Subject<StealthUserAction>();
    this.privateStates$ = new Rx.Subject<StealthPrivateState>();
    this.state$ = Rx.combineLatest(
      [
        providers.publicDataProvider
          .contractStateObservable(this.deployedContractAddress, { type: 'all' })
          .pipe(Rx.map((contractState) => Stealth.ledger(contractState.data))),
        Rx.concat(
          Rx.from(
            Rx.defer(() =>
              providers.privateStateProvider.get(contractPrivateStateId) as Promise<StealthPrivateState>,
            ),
          ),
          this.privateStates$,
        ),
        Rx.concat(Rx.of<StealthUserAction>({ increment: undefined }), this.turns$),
      ],
      (ledgerState, privateState, userActions) => ({
        round: ledgerState.round,
        privateState,
        turns: userActions,
      }),
    ).pipe(
      Rx.scan(combine, stealthEmptyState),
      Rx.retry({
        delay: 500,
      }),
    );
  }

  async increment(): Promise<void> {
    this.logger?.info('stealth contract increment');
    this.turns$.next({ increment: 'incrementing stealth demo ledger' });
    try {
      const txData = await this.deployedContract.callTx.increment();
      this.logger?.trace({
        increment: {
          message: 'stealth ledger tick',
          txHash: txData.public.txHash,
          blockHeight: txData.public.blockHeight,
        },
      });
      this.turns$.next({ increment: undefined });
    } catch (e) {
      this.turns$.next({ increment: undefined });
      throw e;
    }
  }

  static async deploy(
    contractPrivateStateId: typeof StealthPrivateStateId,
    providers: StealthProviders,
    logger: Logger,
  ): Promise<StealthContractController> {
    logger.info({ deployContract: { action: 'Deploying stealth contract', contractPrivateStateId } });
    const deployedContract = await deployContract(providers, {
      compiledContract: stealthCompiledContract,
      privateStateId: contractPrivateStateId,
      initialPrivateState: await StealthContractController.getPrivateState(
        contractPrivateStateId,
        providers.privateStateProvider,
      ),
    });
    return new StealthContractController(contractPrivateStateId, deployedContract, providers, logger);
  }

  static async join(
    contractPrivateStateId: typeof StealthPrivateStateId,
    providers: StealthProviders,
    contractAddress: ContractAddress,
    logger: Logger,
  ): Promise<StealthContractController> {
    logger.info({ joinContract: { action: 'Joining stealth contract', contractPrivateStateId, contractAddress } });
    const deployedContract = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: stealthCompiledContract,
      privateStateId: contractPrivateStateId,
      initialPrivateState: await StealthContractController.getPrivateState(
        contractPrivateStateId,
        providers.privateStateProvider,
      ),
    });
    return new StealthContractController(contractPrivateStateId, deployedContract, providers, logger);
  }

  private static async getPrivateState(
    stealthPrivateStateId: typeof StealthPrivateStateId,
    privateStateProvider: PrivateStateProvider<typeof StealthPrivateStateId, StealthPrivateState>,
  ): Promise<StealthPrivateState> {
    const existingPrivateState = await privateStateProvider.get(stealthPrivateStateId);
    const initialState = await this.getOrCreateInitialPrivateState(stealthPrivateStateId, privateStateProvider);
    return existingPrivateState ?? initialState;
  }

  static async getOrCreateInitialPrivateState(
    stealthPrivateStateId: typeof StealthPrivateStateId,
    privateStateProvider: PrivateStateProvider<typeof StealthPrivateStateId, StealthPrivateState>,
  ): Promise<StealthPrivateState> {
    let state = await privateStateProvider.get(stealthPrivateStateId);
    if (state === null) {
      state = createPrivateState(0);
      await privateStateProvider.set(stealthPrivateStateId, state);
    }
    return state;
  }
}
