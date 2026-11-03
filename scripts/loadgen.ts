// Throwaway: drive real CPU load inside a guest so the hypervisor metric
// sampler has something to actually chart. Never prints the guest password.
import { execFile } from 'child_process';
import { rawDb } from '../lib/db/index.ts';
import { decrypt } from '../lib/core/crypto.ts';

async function main() {
  const rd = rawDb();
  const row = rd
    .prepare(`select i.ip, i.root_pass_enc from instances i where i.domain_name = ?`)
    .get(process.argv[2] ?? 'machina-5d7f0f3c9059f');
  if (!row) throw new Error('no such instance');
  const pw = decrypt(row.root_pass_enc);

  const sh = (cmd: string, ms = 30_000): Promise<string> =>
    new Promise((res) => {
      execFile(
        'sshpass',
        ['-p', pw, 'ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15',
          `root@${row.ip}`, cmd],
        { timeout: ms },
        (e, so, se) => res(e ? `ERR: ${String(se).split('\n')[0]}` : so),
      );
    });

  const nproc = (await sh('nproc')).trim();
  console.log('guest vcpus:', nproc);

  // Two burners per vcpu so a single-core guest is genuinely saturated.
  const start = await sh(
    'for i in $(seq 1 4); do nohup sh -c "while :; do dd if=/dev/zero of=/dev/null bs=64k count=64 2>/dev/null; done" >/dev/null 2>&1 & done; sleep 2; uptime',
    45_000,
  );
  console.log('load started:', start.trim().split('\n').pop());

  // Also write, so the disk-throughput chart has a signal too.
  await sh('nohup sh -c "while :; do dd if=/dev/zero of=/tmp/mload bs=1M count=64 2>/dev/null; sync; rm -f /tmp/mload; done" >/dev/null 2>&1 & sleep 1; echo diskload-on', 45_000);
  console.log('disk load started');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
