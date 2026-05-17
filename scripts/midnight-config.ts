/**
 * Midnight network endpoints for deploy / wallet scripts.
 */
export interface Config {
  readonly logDir: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}