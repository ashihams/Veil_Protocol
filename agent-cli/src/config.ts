import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import path from 'node:path';

export const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');

export const contractConfig = {
  privateStateStoreName: 'agent-private-state',
  zkConfigPath: {
    identity: path.resolve(currentDir, '..', '..', 'agent-contract', 'src', 'managed', 'identity'),
    reputation: path.resolve(currentDir, '..', '..', 'agent-contract', 'src', 'managed', 'reputation'),
    validation: path.resolve(currentDir, '..', '..', 'agent-contract', 'src', 'managed', 'validation'),
  },
};

export interface Config {
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

export class PreviewConfig implements Config {
  logDir = path.resolve(currentDir, '..', 'logs', `${new Date().toISOString()}.log`);
  indexer = 'https://indexer.preview.midnight.network/api/v3/graphql';
  indexerWS = 'wss://indexer.preview.midnight.network/api/v3/graphql/ws';
  node = 'https://rpc.preview.midnight.network';
  proofServer = 'http://127.0.0.1:6300';
  constructor() {
    setNetworkId('preview');
  }
}
