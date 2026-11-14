import type { ValidationIssue } from '../../shared/types';

/** An error the person can be told about. `message` is always plain language and safe to show. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: ValidationIssue[],
    /** Extra facts a screen can use, e.g. which meeting already follows this one. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find that.") {
    super(404, 'not_found', message);
  }
}

/** The rev did not match: the row was changed somewhere else (§4.6). */
export class ConflictError extends AppError {
  constructor(
    message = 'This meeting was changed somewhere else. Please reload it and try again.',
  ) {
    super(409, 'conflict', message);
  }
}

export class ValidationFailed extends AppError {
  constructor(issues: ValidationIssue[], message?: string, details?: Record<string, unknown>) {
    super(
      400,
      'invalid',
      message ??
        (issues.length === 1
          ? // A single problem with the form as a whole reads best as its own sentence.
            issues[0]?.field === 'form'
            ? (issues[0]?.message as string)
            : '1 thing needs your attention.'
          : `${issues.length} things need your attention.`),
      issues,
      details,
    );
  }
}

export class UndoUnavailableError extends AppError {
  constructor(message = "This can't be undone because the meeting has changed since.") {
    super(409, 'undo_unavailable', message);
  }
}

/** The spreadsheet the app was using is gone (deleted, or no longer shared). The person is offered a way back (§11). */
export class DatabaseMissingError extends AppError {
  constructor() {
    super(503, 'database_missing', "Your database couldn't be found.");
  }
}

export class NotSetUpError extends AppError {
  constructor() {
    super(503, 'not_set_up', 'The app is not set up yet. The owner needs to sign in once first.');
  }
}
