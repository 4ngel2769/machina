/**
 * In-process keyed mutex. better-sqlite3 is synchronous but quota checks and
 * the writes they guard are separated by slow I/O (an ISO body stream, a
 * docker run), so two requests from the same user can both pass a check
 * before either commits. Serializing per key makes check+commit atomic for
 * that user. Cross-user races on shared caps are still caught by the
 * post-write re-check each caller already performs.
 */

const tails = new Map<string, Promise<void>>();

/** Run `fn` after every earlier call for the same key has settled. */
export async function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const result = previous.then(() => fn());
  // The stored tail swallows rejection so one failed call cannot wedge the
  // queue for everyone behind it.
  const tail = result.then(() => undefined, () => undefined);
  tails.set(key, tail);
  try {
    return await result;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}
