import type { ValidationIssue } from '@/shared/types';
import { reportDatabaseMissing } from './db-missing';

/** An error from the server, already in plain language. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: ValidationIssue[] = [],
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The connection failed before the server answered. The request may or may not have arrived. */
export class NetworkError extends Error {
  constructor() {
    super('network');
    this.name = 'NetworkError';
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/** Calls the API with the header the server needs on every change (§8). Throws ApiError or NetworkError. */
export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'X-Requested-With': 'mm',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // not JSON
  }
  if (!res.ok) {
    const e = (
      data as {
        error?: {
          code?: string;
          message?: string;
          issues?: ValidationIssue[];
          details?: Record<string, unknown>;
        };
      } | null
    )?.error;
    if (e?.code === 'database_missing') reportDatabaseMissing();
    throw new ApiError(
      res.status,
      e?.code ?? 'error',
      e?.message ?? 'Something went wrong. Please try again.',
      e?.issues,
      e?.details,
    );
  }
  return data as T;
}
