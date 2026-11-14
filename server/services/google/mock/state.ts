import type { AppState, StateStore } from '../types';

/** In-memory stand-in for DATA_DIR/state.json. `lose()` simulates a missing or unreadable file. */
export class MockStateStore implements StateStore {
  private state: AppState | null;

  constructor(initial: AppState | null = { jobs: {} }) {
    this.state = initial ? structuredClone(initial) : null;
  }

  async read(): Promise<AppState | null> {
    return this.state ? structuredClone(this.state) : null;
  }

  async write(state: AppState): Promise<void> {
    this.state = structuredClone(state);
  }

  lose(): void {
    this.state = null;
  }
}
