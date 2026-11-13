/**
 * Deliberate error swallowing. `.catch(() => {})` hides intent — a reader
 * cannot tell "we know this can fail and don't care" from "nobody handled it".
 * `ignore('reason')` names the reason at the call site; the reason is
 * documentation for the reader, not behaviour.
 */

export function ignore(_reason: string): (err: unknown) => undefined {
  return () => undefined;
}
