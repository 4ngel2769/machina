/**
 * Admin edits to a domain's stored config.
 *
 * One function per operation, held in a table, so adding an operation cannot
 * change the shape of the dispatcher. Everything here is config-level: a
 * topology, boot-order or device change cannot be applied to a running domain
 * anyway, and pretending otherwise produces a UI that says "saved" while the
 * guest runs the old spec.
 */
import { virsh } from '@/lib/core/driver';
import { storagePaths } from '@/lib/config';
import { run } from '../exec';
import { isoPath } from '../iso';
import fs from 'fs/promises';
import path from 'path';
import { vmDetail } from './detail';
import { attr, elems, assertName, editXml, INT } from './xml';
import type { VmOp } from './types';

type Running = boolean;
type Handler<K extends VmOp['op']> =
  (name: string, op: Extract<VmOp, { op: K }>, running: Running) => Promise<string>;

/** Temp-file dance shared by every attach/detach that hands libvirt XML. */
async function withXmlFile<T>(prefix: string, xml: string, fn: (tmp: string) => Promise<T>): Promise<T> {
  const tmp = path.join(storagePaths().tmp, `${prefix}-${Date.now()}.xml`);
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, xml, 'utf8');
  try {
    return await fn(tmp);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

/** Lowest unused device name on the vd or sd bus. */
function freeSlot(used: Set<string>, prefix: 'vd' | 'sd'): string {
  for (let i = 0; i < 26; i += 1) {
    const cand = `${prefix}${String.fromCharCode(97 + i)}`;
    if (!used.has(cand)) return cand;
  }
  return '';
}

const VM_OPS: { [K in VmOp['op']]: Handler<K> } = {
  power: async (name, op) => {
    const map: Record<string, string[]> = {
      start: ['start'], shutdown: ['shutdown'], reboot: ['reboot'], destroy: ['destroy'],
      reset: ['reset'], pause: ['suspend'], resume: ['resume'],
    };
    await virsh([...map[op.action], name]);
    return `${op.action} sent`;
  },

  autostart: async (name, op) => {
    await virsh(['autostart', ...(op.on ? [] : ['--disable']), name]);
    return op.on ? 'will start with the host' : 'will not start with the host';
  },

  vcpu: async (name, op, running) => {
    const max = Math.min(op.max ?? op.count, 64);
    const count = Math.min(op.count, max);
    await virsh(['setvcpus', name, String(max), '--maximum', '--config']);
    await virsh(['setvcpus', name, String(count), '--config']);
    if (running) await virsh(['setvcpus', name, String(count), '--live']).catch(() => {});
    return `${count} vCPU (max ${max})${running ? '' : ' — applies at next start'}`;
  },

  memory: async (name, op, running) => {
    const mb = INT(op.mb, 128, 1_048_576, 'memory MB');
    await virsh(['setmaxmem', name, `${mb}M`, '--config']);
    await virsh(['setmem', name, `${mb}M`, '--config']);
    if (running) await virsh(['setmem', name, `${mb}M`, '--live']).catch(() => {});
    return `${mb} MB${running ? '' : ' — applies at next start'}`;
  },

  topology: async (name, op) => {
    const s = INT(op.sockets, 1, 16, 'sockets');
    const c = INT(op.cores, 1, 64, 'cores');
    const t = INT(op.threads, 1, 8, 'threads');
    await editXml(name, (xml) => {
      const topo = `<topology sockets='${s}' dies='1' clusters='1' cores='${c}' threads='${t}'/>`;
      if (/<topology\b[^>]*\/>/.test(xml)) return xml.replace(/<topology\b[^>]*\/>/, topo);
      if (/<cpu\b[^>]*>/.test(xml)) return xml.replace(/(<cpu\b[^>]*>)/, `$1\n    ${topo}`);
      return xml.replace(/(<vcpu\b[^>]*>[\s\S]*?<\/vcpu>)/, `$1\n  <cpu><${topo.slice(1)}</cpu>`);
    });
    return `topology ${s}×${c}×${t} — applies at next start`;
  },

  cpuMode: async (name, op) => {
    const mode = op.mode;
    if (!['host-passthrough', 'host-model', 'custom', 'maximum'].includes(mode)) throw new Error('unsupported cpu mode');
    await editXml(name, (xml) => {
      if (/<cpu\b[^>]*mode='[^']*'/.test(xml)) return xml.replace(/(<cpu\b[^>]*mode=')[^']*(')/, `$1${mode}$2`);
      if (/<cpu\b/.test(xml)) return xml.replace(/<cpu\b/, `<cpu mode='${mode}'`);
      return xml.replace('</devices>', `</devices>`); // nothing to do without a cpu block
    });
    return `cpu mode ${mode} — applies at next start`;
  },

  boot: async (name, op) => {
    const devs = op.order.filter((d) => ['hd', 'cdrom', 'network', 'fd'].includes(d)).slice(0, 4);
    if (!devs.length) throw new Error('at least one boot device');
    await editXml(name, (xml) => {
      const seq = devs.map((d) => `    <boot dev='${d}'/>`).join('\n');
      if (/<boot\b[^>]*dev='[^']*'\/>/.test(xml)) {
        return xml.replace(/(<os\b[^>]*>[\s\S]*?)(\s*<boot\b[^>]*\/>)+/, `$1\n${seq}`);
      }
      return xml.replace(/(<os\b[^>]*>)/, `$1\n${seq}`);
    });
    return `boot order ${devs.join(' → ')}`;
  },

  watchdog: async (name, op) => {
    if (op.action === 'none') {
      await editXml(name, (xml) => xml.replace(/\s*<watchdog\b[\s\S]*?(?:\/>|<\/watchdog>)/, ''));
      return 'watchdog removed';
    }
    await editXml(name, (xml) => {
      // Keep whatever model the domain already declares. A guest only has the
      // driver for the model it was built against, so swapping i6300esb in
      // over an itco watchdog would silently stop it firing.
      const model = xml.match(/<watchdog\b[^>]*model='([^']*)'/)?.[1] ?? 'i6300esb';
      const el = `<watchdog model='${model}' action='${op.action}'/>`;
      if (/<watchdog\b[\s\S]*?(?:\/>|<\/watchdog>)/.test(xml)) return xml.replace(/<watchdog\b[\s\S]*?(?:\/>|<\/watchdog>)/, el);
      return xml.replace('</devices>', `  ${el}\n</devices>`);
    });
    return `watchdog action ${op.action} — applies at next start`;
  },

  diskAttach: async (name, op) => {
    const gb = INT(op.sizeGb, 1, 2000, 'disk GB');
    const detail = await vmDetail(name);
    const free = freeSlot(new Set(detail.disks.map((d) => d.target)), 'vd');
    if (!free) throw new Error('no free vd* slot left');
    const file = path.join(storagePaths().vms, `hot-${name}-${free}-${Date.now()}.qcow2`);
    await run('qemu-img', ['create', '-f', 'qcow2', file, `${gb}G`], { sudo: true });
    await run('chown', ['libvirt-qemu:kvm', file], { sudo: true }).catch(() => {});
    await virsh(['attach-disk', name, file, free, '--driver', 'qemu', '--subdriver', 'qcow2',
      '--targetbus', op.bus === 'sata' ? 'sata' : 'virtio', '--config']);
    return `attached ${gb}G as ${free} — appears at next start`;
  },

  diskDetach: async (name, op) => {
    await virsh(['detach-disk', name, op.target, '--config']);
    return `detached ${op.target} — applies at next start`;
  },

  nicAttach: async (name, op) => {
    await virsh(['attach-interface', name, '--type', 'network', '--source', op.network,
      '--model', op.model === 'e1000' ? 'e1000' : 'virtio', '--config']);
    return `added a network interface on ${op.network} — applies at next start`;
  },

  nicDetach: async (name, op) => {
    await virsh(['detach-interface', name, '--type', 'network', '--mac', op.mac, '--config']);
    return `removed interface ${op.mac}`;
  },

  hostdevAttach: async (name, op) => {
    const v = op.vendor.replace(/^0x/, '');
    const p = op.product.replace(/^0x/, '');
    if (!/^[0-9a-f]{4}$/i.test(v) || !/^[0-9a-f]{4}$/i.test(p)) throw new Error('vendor and product must be 4 hex digits');
    const xml = `<hostdev mode='subsystem' type='usb' managed='yes'>
  <source><vendor id='0x${v}'/><product id='0x${p}'/></source>
</hostdev>`;
    await withXmlFile('hostdev', xml, (tmp) => virsh(['attach-device', name, tmp, '--config']));
    return `USB ${v}:${p} attached — applies at next start`;
  },

  hostdevDetach: async (name, op) => {
    const detail = await vmDetail(name);
    const dev = detail.hostdevs[op.index];
    if (!dev) throw new Error('no such host device on this domain');
    await withXmlFile('hostdev', dev.xml, (tmp) => virsh(['detach-device', name, tmp, '--config']));
    return 'host device removed';
  },

  dirAttach: async (name, op) => {
    if (!op.source.startsWith('/')) throw new Error('shared dir must be an absolute path');
    if (!/^[a-zA-Z0-9_.-]{1,32}$/.test(op.tag)) throw new Error('mount tag: letters, digits, . _ -');
    await editXml(name, (xml) => xml.replace('</devices>',
      `  <filesystem type='mount' accessmode='passthrough'>
    <source dir='${op.source}'/>
    <target dir='${op.tag}'/>
  </filesystem>\n</devices>`));
    return `shared ${op.source} as tag ${op.tag} — mount it in the guest with -t 9p`;
  },

  dirDetach: async (name, op) => {
    await editXml(name, (xml) => {
      const el = elems(xml, 'filesystem').find((f) => attr(f, 'target', 'dir') === op.tag);
      if (!el) throw new Error(`no shared dir tagged ${op.tag}`);
      return xml.replace(el, '');
    });
    return `shared dir ${op.tag} removed`;
  },

  isoAttach: async (name, op, running) => {
    // A cdrom's source is a startup property. Swapping it on a live domain is
    // a change-media job with its own eject/insert dance, and doing it
    // half-way is how a guest ends up with a locked tray it cannot boot past.
    if (running) throw new Error('stop the VM first: media is inserted in the stored config');
    const file = await isoPath(op.iso);
    const st = await fs.stat(file).catch(() => null);
    if (!st?.isFile()) throw new Error('no such iso — refresh the list');
    const detail = await vmDetail(name);
    // The seed already owns vdb, so installer media goes on the sata bus as
    // sd*, exactly where a BIOS looks for a boot cdrom.
    const free = freeSlot(new Set(detail.disks.map((d) => d.target)), 'sd');
    if (!free) throw new Error('no free sata slot left');
    await virsh(['attach-disk', name, file, free,
      '--type', 'cdrom', '--mode', 'readonly',
      '--driver', 'qemu', '--subdriver', 'raw',
      '--targetbus', 'sata', '--config']);
    return `inserted ${op.iso} as ${free} — appears at next start`;
  },

  isoDetach: async (name, op) => {
    await virsh(['detach-disk', name, op.target, '--config']);
    return `ejected ${op.target} — applies at next start`;
  },

  spice: async (name, op, running) => {
    if (running) throw new Error('stop the VM first: SPICE graphics changes apply to stored config');
    await editXml(name, (xml) => {
      const existing = elems(xml, 'graphics').find((g) => /type='spice'/.test(g));
      if (!op.on) return existing ? xml.replace(existing, '') : xml;
      if (existing) return xml;
      return xml.replace('</devices>', "    <graphics type='spice' autoport='yes' listen='127.0.0.1'><listen type='address' address='127.0.0.1'/></graphics>\n  </devices>");
    });
    return op.on ? 'SPICE enabled on loopback — applies at next start' : 'SPICE disabled';
  },
};

/** Apply an admin edit. Returns a human line describing what changed. */
export async function applyVmOp(name: string, op: VmOp): Promise<string> {
  assertName(name);
  const live = (await virsh(['domstate', name]).catch(() => 'shut off')).trim();
  const running = /running/i.test(live);
  const handler = VM_OPS[op.op] as unknown as
    ((n: string, o: VmOp, r: boolean) => Promise<string>) | undefined;
  if (!handler) throw new Error('unknown operation');
  return handler(name, op, running);
}
