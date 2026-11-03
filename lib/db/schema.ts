import { sqliteTable, text, integer, real, unique, index, primaryKey } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'user'] }).default('user').notNull(),
  passwordHash: text('password_hash'),
  // Running balance in cents; only mutated by admin grants and hourly metering.
  balanceCents: integer('balance_cents').default(0).notNull(),
  // OS assignment: imagePickable=1 means user can choose OS; 0 means admin assigns.
  imagePickable: integer('image_pickable').default(1).notNull(),
  assignedImageId: text('assigned_image_id'),
  createdAt: integer('created_at').notNull(),
}, (t) => [unique('uniq_user_name').on(t.name)]);

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  vcpu: integer('vcpu').notNull(),
  ramMb: integer('ram_mb').notNull(),
  diskGb: integer('disk_gb').notNull(),
  hourlyRateCents: integer('hourly_rate_cents').notNull(),
  monthlyCapMin: integer('monthly_cap_min').default(720).notNull(),
  // Monthly transfer allowance in GB (rx+tx combined). 0 = unlimited.
  bandwidthGb: real('bandwidth_gb').default(100).notNull(),
  active: integer('active').default(1).notNull(),
});

export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  distro: text('distro'),
  version: text('version'),
  url: text('url').notNull(),
  sha256: text('sha256').default('').notNull(),
  sha256Url: text('sha256_url').default('').notNull(),
  path: text('path').default('').notNull(),
  // 'broken' = quarantined by auditImageBootability(): the file has no BIOS
  // bootloader (UEFI-only build) so it can never boot on our SeaBIOS guests.
  // Must stay in this union or every raw-SQL write of it is a type lie.
  status: text('status', { enum: ['missing', 'downloading', 'ready', 'failed', 'broken'] })
    .default('missing').notNull(),
  failure: text('failure'),
  sizeBytes: integer('size_bytes').default(0).notNull(),
  updatedAt: integer('updated_at').default(0).notNull(),
});

export const sshKeys = sqliteTable('ssh_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  label: text('label').notNull(),
  pubKey: text('pub_key').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('ssh_keys_user_idx').on(t.userId)]);

export const instances = sqliteTable('instances', {
  id: text('id').primaryKey(), // vm_<16 hex>
  domainName: text('domain_name').notNull(),
  userId: text('user_id').notNull(),
  planId: text('plan_id').notNull(),
  imageId: text('image_id').notNull(),
  name: text('name').notNull(), // per-user unique display name
  rateHourlyCents: integer('rate_hourly_cents').notNull().default(0),
  monthlyCapMin: integer('monthly_cap_min').notNull().default(720),
  // Snapshot of the plan's bandwidth allowance at provision time. 0 = unlimited.
  bandwidthGb: real('bandwidth_gb').notNull().default(0),
  // provisioning | running | stopped | suspended | error
  status: text('status').default('provisioning').notNull(),
  mac: text('mac').notNull(),
  ip: text('ip').notNull(),
  vncSocket: text('vnc_socket'),
  vncPass: text('vnc_pass'),
  rootPassEnc: text('root_pass_enc'), // AES-256-GCM blob
  autoSuspended: integer('auto_suspended').default(0).notNull(),
  /** bounded self-heal counter: retries we grant a stuck provisioning before
   *  giving up and showing the user a real error (never an endless loop) */
  healCount: integer('heal_count').default(0).notNull(),
  destroyAt: integer('destroy_at'), // expiry (rented-hours exhaustion)
  lastSettleAt: integer('last_settle_at').default(0).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  notes: text('notes'),
}, (t) => [
  unique('uniq_user_instname').on(t.userId, t.name),
  index('idx_inst_domain').on(t.domainName),
  index('idx_inst_user').on(t.userId),
]);

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  instanceId: text('instance_id'),
  userId: text('user_id'),
  payload: text('payload').default('{}').notNull(), // JSON
  status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
    .default('queued').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  log: text('log').default('').notNull(),
  error: text('error').default('').notNull(),
  runAfter: integer('run_after').default(0).notNull(),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
}, (t) => [index('jobs_status_idx').on(t.status)]);

/** 15-min usage samples. weight = fractional HOURS the instance was up. */
export const usage = sqliteTable('usage', {
  id: text('id').primaryKey(),
  instanceId: text('instance_id').notNull(),
  running: integer('running').notNull(),
  weight: integer('weight').notNull(), // hours*4 => int basis he? plain float text later
  ts: integer('ts').notNull(),
}, (t) => [index('usage_inst_ts_idx').on(t.instanceId, t.ts)]);

/** Running-balance movements. deltaCents signed. */
export const ledger = sqliteTable('ledger', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  deltaCents: integer('delta_cents').notNull(), // signed
  reason: text('reason').notNull(), // meter | topup | grant
  refType: text('ref_type'),
  refId: text('ref_id'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('ledger_user_ts_idx').on(t.userId, t.createdAt)]);

export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(),
  ts: integer('ts').notNull(),
  actorId: text('actor_id'),
  actorName: text('actor_name'),
  action: text('action').notNull(),
  target: text('target'),
  detail: text('detail'),
}, (t) => [index('audit_ts_idx').on(t.ts)]);

/** Monthly transfer accounting per instance. rx/tx are accumulated DELTAS
 *  (bytes actually moved this month); rxLast/txLast anchor the libvirt
 *  cumulative counters between samples (counter resets on domain restart
 *  are absorbed by clamping). throttled = live domiftune limit in place. */
export const netMonthly = sqliteTable('net_monthly', {
  instanceId: text('instance_id').notNull(),
  month: text('month').notNull(), // YYYY-MM
  rxBytes: integer('rx_bytes').default(0).notNull(),
  txBytes: integer('tx_bytes').default(0).notNull(),
  rxLast: integer('rx_last').default(0).notNull(),
  txLast: integer('tx_last').default(0).notNull(),
  throttled: integer('throttled').default(0).notNull(),
  updatedAt: integer('updated_at').default(0).notNull(),
}, (t) => [primaryKey({ columns: [t.instanceId, t.month] })]);

/** Tenant-facing index of libvirt snapshots held inside an instance's qcow2. */
export const snapshots = sqliteTable('snapshots', {
  id: text('id').primaryKey(),
  instanceId: text('instance_id').notNull(),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  state: text('state').default('disk').notNull(), // disk | running
  sizeBytes: integer('size_bytes').default(0).notNull(),
  current: integer('current').default(0).notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  unique('uniq_snap_inst_name').on(t.instanceId, t.name),
  index('snapshots_inst_idx').on(t.instanceId),
]);

/** Raw hypervisor counters. Cumulative, so rates are derived at read time. */
export const metrics = sqliteTable('metrics', {
  instanceId: text('instance_id').notNull(),
  ts: integer('ts').notNull(),
  cpuNs: integer('cpu_ns').default(0).notNull(),
  ncpu: integer('ncpu').default(0).notNull(),
  ramKb: integer('ram_kb').default(0).notNull(),
  ramMaxKb: integer('ram_max_kb').default(0).notNull(),
  rdB: integer('rd_b').default(0).notNull(),
  wrB: integer('wr_b').default(0).notNull(),
  allocB: integer('alloc_b').default(0).notNull(),
}, (t) => [primaryKey({ columns: [t.instanceId, t.ts] }), index('metrics_ts_idx').on(t.ts)]);

/** Per-user resource quota. NULL = unlimited, 0 = none allowed. */
export const quotas = sqliteTable('quotas', {
  userId: text('user_id').primaryKey(),
  maxVms: integer('max_vms'),
  maxVcpus: integer('max_vcpus'),
  maxMemoryMb: integer('max_memory_mb'),
  maxDiskGb: integer('max_disk_gb'),
  maxRunning: integer('max_running'),
  suspended: integer('suspended').default(0).notNull(),
  note: text('note'),
  updatedAt: integer('updated_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type Instance = typeof instances.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Image = typeof images.$inferSelect;
export type SshKey = typeof sshKeys.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
