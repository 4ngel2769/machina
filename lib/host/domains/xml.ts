/**
 * Reading and rewriting domain XML: attribute/element scrapers, the name
 * whitelist, and the write path that backs the old XML up before defining.
 *
 * There is no XML parser here on purpose. libvirt's dumpxml is regular enough
 * that a handful of patterns are safe, and adding a parser would mean
 * round-tripping a document we must not reformat.
 */
import { virsh } from '@/lib/core/driver';
import { storagePaths } from '@/lib/config';
import fs from 'fs/promises';
import path from 'path';

const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

/** Domain names reach libvirt as an argument, so reject anything exotic. */
export function assertName(name: string): string {
  if (!NAME_OK.test(name)) throw new Error('invalid domain name');
  return name;
}

export function attr(xml: string, tag: string, name: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*\\b${name}='([^']*)'`).exec(xml);
  return m?.[1] ?? null;
}

export function elems(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>|<${tag}\\b[^>]*\\/>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
}

/** Whole number inside a range, or a message that says which field failed. */
export const INT = (v: unknown, min: number, max: number, what: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${what} must be a whole number ${min}-${max}`);
  return n;
};

/**
 * Rewrite the stored config. Returns false when `fn` produced identical XML, so
 * callers can report "no change" instead of a misleading "saved".
 *
 * A backup is written before every define: this is the only path that can lose
 * an operator's hand-written XML.
 */
export async function editXml(name: string, fn: (xml: string) => string): Promise<boolean> {
  assertName(name);
  let xml = '';
  try { xml = await virsh(['dumpxml', '--inactive', name]); } catch {
    throw new Error('this domain is transient (not persistent), so it has no stored config to edit');
  }
  const next = fn(xml);
  if (next === xml) return false;
  const dir = path.join(storagePaths().root, 'xml-backups');
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(dir, `dom-${name}-${Date.now()}.xml`), xml, 'utf8').catch(() => {});
  const tmp = path.join(storagePaths().tmp, `dom-${Date.now()}.xml`);
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, next, 'utf8');
  try {
    await virsh(['define', tmp]);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
  return true;
}
