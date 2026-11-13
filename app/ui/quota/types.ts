/** Shapes for the quota editor. */

export type Quota = {
  maxVms: number | null; maxVcpus: number | null; maxMemoryMb: number | null;
  maxDiskGb: number | null; maxRunning: number | null;
  maxIsoCount: number | null; maxIsoTotalGb: number | null;
  maxContainers: number | null; maxContainerMemMb: number | null; maxContainerCpus: number | null;
  suspended: boolean; note: string | null;
};
export type Usage = {
  vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number;
  isos: number; isoGb: number; containers: number; containerMemMb: number; containerCpus: number;
};
export type Row = { userId: string; name: string; role: string; quota: Quota; usage: Usage; balanceCents: number };

/** The editable fields, in display order. */
export type Field = { key: keyof Quota; label: string; unit?: string };

export const FIELDS: Field[] = [
  { key: 'maxVms', label: 'VMs' },
  { key: 'maxRunning', label: 'running' },
  { key: 'maxVcpus', label: 'vCPU' },
  { key: 'maxMemoryMb', label: 'RAM', unit: 'MB' },
  { key: 'maxDiskGb', label: 'disk', unit: 'GB' },
  { key: 'maxIsoCount', label: 'ISOs' },
  { key: 'maxIsoTotalGb', label: 'ISO storage', unit: 'GB' },
  { key: 'maxContainers', label: 'containers' },
  { key: 'maxContainerMemMb', label: 'container RAM', unit: 'MB' },
  { key: 'maxContainerCpus', label: 'container vCPU' },
];

/** "blank" is unlimited. The input holds a string precisely so an empty field
 *  is distinguishable from the literal 0 — 0 is a real answer (may not create)
 *  and coercing it to null would silently turn a denial into unlimited. */
export const asInput = (value: number | null) => (value === null ? '' : String(value));
