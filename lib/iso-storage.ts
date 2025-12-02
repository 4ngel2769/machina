import fs from 'fs/promises';
import path from 'path';
import { sanitizeFilename } from '@/lib/path-security';

const DEFAULT_UPLOAD_ROOT = process.env.USER_ISO_UPLOAD_DIR || path.join(process.cwd(), 'data', 'user-isos');

function safeUserSegment(userId: string): string {
  const sanitized = (userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  return sanitized.length > 0 ? sanitized : 'user';
}

export function getIsoUploadRoot(): string {
  return path.resolve(DEFAULT_UPLOAD_ROOT);
}

export function getUserIsoDirectory(userId: string): string {
  return path.join(getIsoUploadRoot(), safeUserSegment(userId));
}

export async function ensureUserIsoDirectory(userId: string): Promise<string> {
  const dir = getUserIsoDirectory(userId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function isPathWithinUserIsoDir(userId: string, targetPath: string): boolean {
  const userDir = path.resolve(getUserIsoDirectory(userId));
  const target = path.resolve(targetPath);
  return target === userDir || target.startsWith(`${userDir}${path.sep}`);
}

export function sanitizeIsoFilename(filename: string): string {
  const sanitized = sanitizeFilename(filename || 'image.iso');
  return sanitized.toLowerCase().endsWith('.iso') ? sanitized : `${sanitized}.iso`;
}

export function getMaxIsoUploadBytes(): number {
  const fallback = 4 * 1024 * 1024 * 1024; // 4 GiB default
  const fromEnv = process.env.MAX_USER_ISO_UPLOAD_BYTES;
  if (!fromEnv) {
    return fallback;
  }

  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
