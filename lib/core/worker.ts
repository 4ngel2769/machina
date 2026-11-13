/**
 * Background worker, split by concern: the poll loop, provisioning self-heal
 * and the boot-time image audit. Callers keep importing this path.
 */
export * from './worker/loop';
export * from './worker/heal';
export { auditImageBootability } from './worker/image-audit';
