/**
 * Runs tasks one after another per key. Writes to a Sheet tab are serialised so two edits can never
 * interleave: the rev check and the write happen together, inside the lock.
 */
export class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await result;
    } finally {
      // Forget the key once nothing is waiting behind this task.
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  /** Number of keys with work in flight, for tests. */
  get busy(): number {
    return this.tails.size;
  }
}
