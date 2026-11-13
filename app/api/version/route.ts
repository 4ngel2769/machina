/**
 * Build identity for uptime monitors and for "is the box I am looking at the
 * box I deployed". Unauthenticated on purpose: it carries nothing an attacker
 * did not already know from a TCP connect, and a version endpoint behind a
 * login is useless to the thing that needs it.
 */

import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const startedAt = Date.now();

/** Read once: package.json cannot change under a running process. */
const VERSION = (() => {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return String(p.version ?? 'unknown');
  } catch {
    return 'unknown';
  }
})();

/** Lazy, because this module is evaluated during `next build` too and a sha
 *  captured then is the sha of the build machine, not the running checkout.
 *  MACHINA_GIT_SHA wins so a container without git still reports something. */
let commit: string | null | undefined;
function gitSha(): string | null {
  if (commit !== undefined) return commit;
  const fromEnv = process.env.MACHINA_GIT_SHA;
  if (fromEnv) { commit = fromEnv.slice(0, 40); return commit; }
  try {
    commit = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: process.cwd(), timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim() || null;
  } catch {
    commit = null;
  }
  return commit;
}

export async function GET() {
  return NextResponse.json(
    {
      name: 'machina',
      version: VERSION,
      commit: gitSha(),
      node: process.versions.node,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
