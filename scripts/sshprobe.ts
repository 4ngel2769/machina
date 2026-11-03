// Throwaway: which guests still answer SSH, and how do they fail?
import { execFile } from 'child_process';
import { rawDb } from '../lib/db/index.ts';
import { decrypt } from '../lib/core/crypto.ts';

async function main() {
  const rd = rawDb();
  const rows = rd.prepare(`select domain_name, ip, root_pass_enc from instances`).all() as
    { domain_name: string; ip: string; root_pass_enc: string }[];

  for (const r of rows) {
    const pw = decrypt(r.root_pass_enc);
    const out = await new Promise((res) => {
      execFile(
        'sshpass',
        ['-p', pw, 'ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=12',
          `root@${r.ip}`, 'nproc && uptime'],
        { timeout: 25_000 },
        (e, so, se) => res(e ? `ERR ${String(se).trim().split('\n')[0] || e.message}` : so.trim().replace(/\n/g, ' | ')),
      );
    });
    console.log(r.domain_name.padEnd(24), r.ip.padEnd(16), out);
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });