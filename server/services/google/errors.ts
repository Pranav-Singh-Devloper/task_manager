/** A Google API failure, normalised so callers can branch on the status without knowing the SDK. */
export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly reason: string = 'unknown',
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }

  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export function isGoogleApiError(err: unknown, status?: number): err is GoogleApiError {
  return err instanceof GoogleApiError && (status === undefined || err.status === status);
}
