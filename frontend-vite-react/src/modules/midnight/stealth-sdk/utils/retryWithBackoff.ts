import { type Logger } from 'pino';

export function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  logger?: Logger,
  retries: number = 10,
  delay: number = 500,
  backoffFactor: number = 1.2,
  maxDelay: number = 30000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt: (retryCount: number, currentDelay: number, isRetry: boolean) => void = (
      retryCount: number,
      currentDelay: number,
      isRetry: boolean,
    ) => {
      operation()
        .then((result) => {
          if (isRetry) {
            logger?.info(`[${operationName}] Operation succeeded after retries.`);
          }
          resolve(result);
        })
        .catch((error) => {
          logger?.error(`[${operationName}] Operation failed: ${error instanceof Error ? error.message : String(error)}`);

          if (retryCount <= 0) {
            logger?.error(`[${operationName}] All retries exhausted. Rejecting.`);
            reject(error);
          } else {
            logger?.info(`[${operationName}] Retrying operation in ${currentDelay}ms...`);
            setTimeout(() => {
              const nextDelay = Math.min(currentDelay * backoffFactor, maxDelay);
              attempt(retryCount - 1, nextDelay, true);
            }, currentDelay);
          }
        });
    };

    attempt(retries, delay, false);
  });
}
