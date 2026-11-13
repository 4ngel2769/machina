
import fs from 'fs';
import path from 'path';

/** Everything honours env overrides so the same code runs dev and prod. */
export const config = {
  storageDir: process.env.MACHINA_STORAGE_DIR || '/var/lib/machina/storage',
  dbPath: process.env.MACHINA_DB_PATH || '/var/lib/machina/machina.db',
  virshUri: process.env.VIRSH_URI || 'qemu:///system',
  virshBin: process.env.VIRSH_BIN || 'virsh',
  qemuImgBin: process.env.QEMU_IMG_BIN || 'qemu-img',
  genisoBin: process.env.GENISO_BIN || 'genisoimage',
  // Control-plane HTTP listen
  serverPort: parseInt(process.env.SERVER_PORT || '3999', 10),
  // Worker behaviour
  workerPollMs: parseInt(process.env.WORKER_POLL_MS || '400', 10),
  // Instance-domain naming
  domainPrefix: 'machina-',
  imagePool: 'machina-images',
  vmsPool: 'machina-vms',
  network: 'machina0',
  // NAT network: 192.168.184.0/24 via machina0 bridge. DHCP inside libvirt
  // serves hosts leases through .2; .50 .99 is OUR dynamic range handed to
  // cloud-init (static, post-DHCP only fallback).
  bridgeName: 'machina0',
  subnet: '192.168.184.0/24',
  cidr: '192.168.184.0/24',
  gateway: '192.168.184.1',
  ipRange: '192.168.184.50 - 192.168.184.250',
  // Billing/metering
  meters: {
    sampleIntervalMin: 15,
    settleCostMinute: 0.5,
    monthlyCapMin: 720,      // 24x30
    suspendThresholdCents: 0,
  },
  limits: {
    minDiskGb: 5,
    maxDiskGb: 160,
    maxRunningPerUser: 4,
    maxRunningTotal: 20,
    shutdownGraceSec: 45,
    fixedHourlyRateCents: 3000, // fallback cost per INSTANCE.running-hour (30c)
    /** Opening credit for a NEWLY CREATED account. Zero on purpose: an account
     *  existing is not the same as an account being funded, and every cent
     *  handed out is one an admin did not decide to hand out. */
    defaultBalanceCents: 0,
    /** The bootstrap admin is metered like anyone else, so it needs a float or
     *  the reconciler auto-suspends its own VMs the moment it starts one. */
    adminBalanceCents: 5000,
    /** Opening quota for a new account. Zero of everything: the account is
     *  provisioned but may not create until an admin says what it may have.
     *  (No quota ROW still means unlimited — that stays true for existing
     *  accounts that predate this default.) */
    defaultQuota: {
      maxVms: 0,
      maxVcpus: 0,
      maxMemoryMb: 0,
      maxDiskGb: 0,
      maxRunning: 0,
    },
    /** Custom (non-preset) VM pricing, in cents per hour per unit. Defaults are
     *  fitted to the seeded ladder: Small (2 vCPU / 2 GB / 20 GB) comes out at
     *  61c against its 60c preset, Micro 31c against 30c. The auto figure is a
     *  starting point an admin can override per box, not a price list. */
    customRate: {
      perVcpuHourCents: 5,
      perGbRamHourCents: 25,
      perGbDiskHourCents: 0.05,
    },
    // Snapshots are the classic rented-VM footgun: cheap to request, and the
    // qcow2 grows with every one of them. Bounded per instance AND against
    // free space on the pool, or one tenant fills the host.
    maxSnapshotsPerInstance: 8,
    // Refuse a new snapshot once the overlay has grown past plan disk * this.
    snapshotGrowthRatio: 1.5,
    // Never create a snapshot with less than this free on the vms pool.
    snapshotFreeSpaceFloorMb: 2048,
    /** Largest ISO an admin may upload. An installer image is a few GB; the cap
     *  exists so a mistyped upload cannot fill the storage volume. */
    maxIsoGb: 16,
  },
  // Hypervisor metric sampling. 20s keeps the UI lively without the sampler
  // ever competing with the job worker for libvirt. Retention is a flat
  // window: at 20s that is 8640 rows per instance, pruned hourly.
  metrics: {
    sampleMs: parseInt(process.env.METRICS_SAMPLE_MS || '20000', 10),
    retainMs: parseInt(process.env.METRICS_RETAIN_MS || String(48 * 3600 * 1000), 10),
    // Per-instance virsh timeout inside a sweep. A wedged guest must not hold
    // the sweep open past this.
    perInstanceTimeoutMs: 12_000,
  },
  masterKey: process.env.MACHINA_MASTER_KEY || '',
  /** SPICE console on new VMs. Off by default: the in-app console is VNC, and
   *  SPICE only pays off for native clients (remote-viewer) via ssh tunnel. */
  spice: { enabled: process.env.MACHINA_SPICE === '1' },
  host: {
    hostname: 'blade',
    publicDomain: 'machina.home',
  },
};

/** Directory map inside storageDir. */
export function storagePaths() {
  return {
    root: config.storageDir,
    images: path.join(config.storageDir, 'images'),
    vms: path.join(config.storageDir, 'vms'),
    seeds: path.join(config.storageDir, 'seeds'),
    vnc: path.join(config.storageDir, 'vnc'),
    tmp: path.join(config.storageDir, 'tmp'),
    ssh: path.join(config.storageDir, 'ssh'),
    serial: path.join(config.storageDir, 'serial'),
    iso: path.join(config.storageDir, 'iso'),
  };
}

/** Runtime files (master key, tool state) live next to the DB. */
export function dataDir(): string {
  return path.dirname(config.dbPath);
}
