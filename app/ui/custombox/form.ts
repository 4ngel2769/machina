/** Form state and request body for the custom-box builder. */

'use client';

import { useState } from 'react';

export type CustomBoxForm = {
  userId: string; name: string; vcpu: string; ram: string; unit: 'MB' | 'GB';
  disk: string; bw: string; capHours: string; rate: string; imageId: string;
};

const EMPTY: CustomBoxForm = {
  userId: '', name: '', vcpu: '2', ram: '2048', unit: 'MB',
  disk: '20', bw: '0', capHours: '12', rate: '', imageId: '',
};

export function useCustomBoxForm(): {
  f: CustomBoxForm;
  set: <K extends keyof CustomBoxForm>(k: K, v: CustomBoxForm[K]) => void;
  reset: () => void;
} {
  const [f, setF] = useState<CustomBoxForm>(EMPTY);
  const set = <K extends keyof CustomBoxForm>(k: K, v: CustomBoxForm[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  // Only the name and the rate override are cleared after a create; the spec
  // numbers stay so a second box can be built by changing one field.
  const reset = () => setF((p) => ({ ...p, name: '', rate: '' }));
  return { f, set, reset };
}

/** RAM as megabytes, whatever unit the operator typed it in. */
function ramMb(f: CustomBoxForm): number {
  return f.unit === 'GB' ? Math.round(Number(f.ram) * 1024) : Math.round(Number(f.ram));
}

/** POST body for /api/admin; blank optional fields stay absent. */
export function customBoxBody(f: CustomBoxForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    op: 'createCustomInstance',
    targetUserId: f.userId,
    name: f.name,
    vcpu: Number(f.vcpu),
    ramMb: ramMb(f),
    diskGb: Number(f.disk),
    bandwidthGb: f.bw === '' ? 0 : Number(f.bw),
    monthlyCapMin: Math.round(Number(f.capHours || '12') * 60),
    imageId: f.imageId || undefined,
  };
  if (f.rate !== '') body.hourlyRateCents = Math.round(Number(f.rate) * 100);
  return body;
}
