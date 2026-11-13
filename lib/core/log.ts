/**
 * Operational logging seam. Everything that is not user-facing output goes
 * through here so the format stays uniform and a future sink (file, journal,
 * structured JSON) has one place to land. Writes straight to stdout/stderr —
 * same channels console.* used, same one-line-per-event shape.
 */

export function logInfo(message: string, ...args: unknown[]): void {
  console.log(message, ...args);
}

export function logWarn(message: string, ...args: unknown[]): void {
  console.warn(message, ...args);
}

export function logError(message: string, ...args: unknown[]): void {
  console.error(message, ...args);
}
