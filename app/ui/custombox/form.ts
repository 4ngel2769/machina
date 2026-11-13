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
  form: CustomBoxForm;
  set: <K extends keyof CustomBoxForm>(key: K, value: CustomBoxForm[K]) => void;
  reset: () => void;
} {
  const [form, setForm] = useState<CustomBoxForm>(EMPTY);
  const set = <K extends keyof CustomBoxForm>(key: K, value: CustomBoxForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  // Only the name and the rate override are cleared after a create; the spec
  // numbers stay so a second box can be built by changing one field.
  const reset = () => setForm((previous) => ({ ...previous, name: '', rate: '' }));
  return { form, set, reset };
}

/** RAM as megabytes, whatever unit the operator typed it in. */
function ramMb(form: CustomBoxForm): number {
  return form.unit === 'GB' ? Math.round(Number(form.ram) * 1024) : Math.round(Number(form.ram));
}

/** POST body for /api/admin; blank optional fields stay absent. */
export function customBoxBody(form: CustomBoxForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    op: 'createCustomInstance',
    targetUserId: form.userId,
    name: form.name,
    vcpu: Number(form.vcpu),
    ramMb: ramMb(form),
    diskGb: Number(form.disk),
    bandwidthGb: form.bw === '' ? 0 : Number(form.bw),
    monthlyCapMin: Math.round(Number(form.capHours || '12') * 60),
    imageId: form.imageId || undefined,
  };
  if (form.rate !== '') body.hourlyRateCents = Math.round(Number(form.rate) * 100);
  return body;
}
