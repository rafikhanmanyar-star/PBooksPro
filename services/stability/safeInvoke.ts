/**
 * Wrap async IPC / promises with a timeout to avoid hanging the UI forever.
 */

export class IpcTimeoutError extends Error {
  constructor(
    public readonly label: string,
    public readonly ms: number
  ) {
    super(`IPC timeout: ${label} after ${ms}ms`);
    this.name = 'IpcTimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new IpcTimeoutError(label, ms));
      }, ms);
    }),
  ]);
}
