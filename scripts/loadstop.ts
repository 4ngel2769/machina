// Throwaway: stop the load generators started by loadgen.ts.
import { execFile } from 'child_process';
import { rawDb } from '../lib/db/index.ts';
import { decrypt } from '../lib/core/crypto.ts';

async function main() {
  const rd = rawDb();
  const r = rd
    .prepare(`select ip, root_pass_enc from instances where domain_name = ?`)
    .get(process.argv[2] ?? 'machina-8f3e61a841175') as { ip: string; root_pass_enc: string };
  if (!r) throw new Error('no such instance');
  const pw = decrypt(r.root_pass_enc);
  const out = await new Promise((res) => {
    execFile(
      'sshpass',
      ['-p', pw, 'ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=12',
        `root@${r.ip}`, 'pkill -f "dd if=/dev/zero"; sleep 5; uptime; rm -f /tmp/mload'],
      { timeout: 40_000 },
      (e, so, se) => res(e ? String(se) : so),
    );
  });
  console.log('after kill:', out.trim());
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });