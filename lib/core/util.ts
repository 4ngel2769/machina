import { newId, randToken } from './crypto';

export function now(): number {
  return Date.now();
}

export function newInstanceId(): string {
  return newId('vm_'); // vm_<16hex>
}

export function newJobId(): string {
  return newId('job_');
}

export { randToken };
