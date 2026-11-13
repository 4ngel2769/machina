/**
 * Docker image plane: inventory, pull and remove. Split from docker-admin.ts
 * for the file-size lint cap. Pull reuses parseImage from docker-create so
 * the registry allowlist and explicit-tag rule are identical everywhere.
 */

import { run } from './exec';
import { validRef, bustStatCache } from './docker';
import { parseImage } from './docker-create';

function megabytes(text: string | undefined): number | null {
  if (!text) return null;
  const match = /([\d.]+)\s*([KMGT]?i?B)/i.exec(text);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const mult = unit.startsWith('k') ? 1 / 1024
    : unit.startsWith('g') ? 1024
    : unit.startsWith('t') ? 1024 * 1024
    : 1;
  return Math.round(value * mult);
}

// ------------------------------------------------------------------- images

export type Image = {
  id: string;
  repo: string;
  tag: string;
  created: string;
  sizeMb: number;
  containers: number;
};

type ImageRow = { ID?: string; Repository?: string; Tag?: string; CreatedSince?: string; Size?: string; Containers?: string };

export async function listImages(): Promise<Image[]> {
  const out = await run('docker', ['images', '--format', '{{json .}}'], { timeout: 20_000 });
  return out.split('\n').filter((line) => line.trim()).map((line) => {
    const row = JSON.parse(line) as ImageRow;
    return {
      id: (row.ID ?? '').slice(0, 12),
      repo: row.Repository ?? '',
      tag: row.Tag ?? '',
      created: row.CreatedSince ?? '',
      sizeMb: megabytes(row.Size) ?? 0,
      containers: Number(row.Containers) || 0,
    };
  }).filter((image) => image.repo && image.tag !== '<none>');
}

/** `docker pull` streams progress; we only need the tail to know it worked. */
export async function pullImage(image: string): Promise<string> {
  const parsed = parseImage(image);
  await run('docker', ['pull', parsed], { timeout: 600_000 });
  bustStatCache();
  return parsed;
}

export async function removeImage(ref: string): Promise<string> {
  if (!validRef(ref) && !/^[A-Za-z0-9][A-Za-z0-9._/:-]{0,255}$/.test(ref)) throw new Error('invalid image reference');
  const out = await run('docker', ['rmi', ref], { timeout: 60_000 });
  bustStatCache();
  return out.trim() || ref;
}

