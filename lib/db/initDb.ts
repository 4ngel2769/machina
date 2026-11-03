import { rawDb } from './index';

export const migrations: { version: string; sql: string }[] = [
  {
    version: '20261016_0001',
    sql: `
      create table if not exists users (
        id text primary key,
        name text not null,
        role text not null default 'user',
        password_hash text,
        balance_cents integer not null default 0,
        created_at integer not null
      );
      create unique index if not exists uniq_user_name on users(name);

      create table if not exists plans (
        id text primary key,
        name text not null,
        vcpu integer not null,
        ram_mb integer not null,
        disk_gb integer not null,
        hourly_rate_cents integer not null,
        monthly_cap_min integer not null default 720,
        active integer not null default 1
      );

      create table if not exists images (
        id text primary key,
        name text not null,
        distro text,
        version text,
        url text not null,
        sha256 text not null default '',
        sha256_url text not null default '',
        path text not null default '',
        status text not null default 'missing',
        failure text,
        size_bytes integer not null default 0,
        updated_at integer not null default 0
      );

      create table if not exists ssh_keys (
        id text primary key,
        user_id text not null,
        label text not null,
        pub_key text not null,
        created_at integer not null
      );
      create index if not exists ssh_keys_user_idx on ssh_keys(user_id);

      create table if not exists instances (
        id text primary key,
        domain_name text not null,
        user_id text not null,
        plan_id text not null,
        image_id text not null,
        name text not null,
        rate_hourly_cents integer not null default 0,
        monthly_cap_min integer not null default 720,
        status text not null default 'provisioning',
        mac text not null,
        ip text not null,
        vnc_socket text,
        vnc_pass text,
        root_pass_enc text,
        auto_suspended integer not null default 0,
        destroy_at integer,
        last_settle_at integer not null default 0,
        created_at integer not null,
        updated_at integer not null,
        notes text
      );
      create unique index if not exists uniq_user_instname on instances(user_id, name);
      create index if not exists idx_inst_domain on instances(domain_name);
      create index if not exists idx_inst_user on instances(user_id);

      create table if not exists jobs (
        id text primary key,
        type text not null,
        instance_id text,
        user_id text,
        payload text not null default '{}',
        status text not null default 'queued',
        attempts integer not null default 0,
        max_attempts integer not null default 3,
        log text not null default '',
        error text not null default '',
        run_after integer not null default 0,
        created_at integer not null,
        started_at integer,
        finished_at integer
      );
      create index if not exists jobs_status_idx on jobs(status);
      create index if not exists jobs_inst_idx on jobs(instance_id);

      create table if not exists usage (
        id text primary key,
        instance_id text not null,
        running integer not null,
        weight integer not null,
        ts integer not null
      );
      create index if not exists usage_inst_ts_idx on usage(instance_id, ts);

      create table if not exists ledger (
        id text primary key,
        user_id text not null,
        delta_cents integer not null,
        reason text not null,
        ref_type text,
        ref_id text,
        note text,
        created_at integer not null
      );
      create index if not exists ledger_user_ts_idx on ledger(user_id, created_at);

      create table if not exists audit (
        id text primary key,
        ts integer not null,
        actor_id text,
        actor_name text,
        action text not null,
        target text,
        detail text
      );
      create index if not exists audit_ts_idx on audit(ts);
    `,
  },
  {
    version: '20261016_0002',
    sql: `
      alter table plans add column bandwidth_gb real not null default 100;
      alter table instances add column bandwidth_gb real not null default 0;

      create table if not exists net_monthly (
        instance_id text not null,
        month text not null,
        rx_bytes integer not null default 0,
        tx_bytes integer not null default 0,
        rx_last integer not null default 0,
        tx_last integer not null default 0,
        throttled integer not null default 0,
        updated_at integer not null default 0,
        primary key (instance_id, month)
      );

      -- one-time backfill of plan allowances (versioned: runs once, never clobbers admin edits)
      update plans set bandwidth_gb = 100  where id = 'micro';
      update plans set bandwidth_gb = 250  where id = 'small';
      update plans set bandwidth_gb = 500  where id = 'medium';
      update plans set bandwidth_gb = 1000 where id = 'large';
      -- existing instances inherit their plan's allowance
      update instances set bandwidth_gb =
        (select bandwidth_gb from plans where plans.id = instances.plan_id)
        where bandwidth_gb = 0;
    `,
  },
  {
    version: '20261017_0003',
    sql: `
      alter table users add column image_pickable integer not null default 1;
      alter table users add column assigned_image_id text;
    `,
  },
  {
    version: '20261017_0004',
    sql: `
      create table if not exists instance_requests (
        id text primary key,
        user_id text not null,
        name text not null,
        plan_id text not null,
        image_id text,
        note text,
        status text not null default 'pending',
        result_instance_id text,
        created_at integer not null,
        reviewed_by text,
        reviewed_at integer,
        review_note text
      );
      create index if not exists instreq_user_idx on instance_requests(user_id);
      create index if not exists instreq_status_idx on instance_requests(status);

      create table if not exists deletion_requests (
        id text primary key,
        user_id text not null,
        status text not null default 'pending',
        requested_at integer not null,
        fulfilled_at integer,
        fulfilled_by text
      );
      create index if not exists delreq_user_idx on deletion_requests(user_id);
    `,
  },
  {
    version: '20261017_0005',
    sql: `
      alter table instances add column heal_count integer not null default 0;
      -- never let a dead provisioning row live forever; surfaced as an error
      -- to the user with a readable reason instead of an endless spinner.
      update instances set status='error' where status='provisioning'
        and created_at < 1792280000000;
    `,
  },
  {
    version: '20261018_0006',
    sql: `
      -- Snapshot bookkeeping. libvirt holds the real snapshot metadata inside
      -- the qcow2; this table is the tenant-facing index (ownership, label,
      -- size) and survives 'virsh snapshot-list' being unavailable.
      create table if not exists snapshots (
        id text primary key,
        instance_id text not null,
        name text not null,
        description text default '' not null,
        state text default 'disk' not null,
        size_bytes integer default 0 not null,
        current integer default 0 not null,
        created_at integer not null
      );
      create index if not exists snapshots_inst_idx on snapshots(instance_id);
      create unique index if not exists snapshots_inst_name on snapshots(instance_id, name);
    `,
  },
  {
    version: '20261018_0008',
    sql: `
      -- Per-user resource quota. This is the whole point of the product: an
      -- admin hands someone an account and says "you may have 2 VMs, 4 vCPU,
      -- 4 GB RAM, 40 GB disk", and provisioning refuses anything past that.
      -- v2 had only two blunt global caps (maxRunningPerUser / maxRunningTotal)
      -- which is not a quota, it is a suggestion.
      -- NULL means unlimited. 0 means literally zero, which is a real and
      -- useful answer ("this account is provisioned but may not create").
      create table if not exists quotas (
        user_id text primary key,
        max_vms integer,
        max_vcpus integer,
        max_memory_mb integer,
        max_disk_gb integer,
        max_running integer,
        suspended integer not null default 0,
        note text,
        updated_at integer not null
      );
    `,
  },
  {
    version: '20261018_0007',
    sql: `
      -- Raw hypervisor counters, sampled every METRICS_SAMPLE_MS. Deliberately
      -- stores CUMULATIVE counters, not pre-computed percentages: a rate is
      -- then the delta between whatever two samples survived, so a missed or
      -- delayed sample degrades to a longer averaging window instead of a gap,
      -- and a counter reset (domain restart) is detectable and clampable at
      -- read time rather than being baked in as a nonsense spike.
      create table if not exists metrics (
        instance_id text not null,
        ts integer not null,
        cpu_ns integer not null default 0,
        ncpu integer not null default 0,
        ram_kb integer not null default 0,
        ram_max_kb integer not null default 0,
        rd_b integer not null default 0,
        wr_b integer not null default 0,
        alloc_b integer not null default 0,
        primary key (instance_id, ts)
      );
      create index if not exists metrics_ts_idx on metrics(ts);
    `,
  },
];

export function initDb(): void {
  const db = rawDb();
  db.exec(`create table if not exists schema_migrations (version text primary key, applied_at integer not null)`);
  const applied = new Set(
    (db.prepare('select version from schema_migrations').all() as { version: string }[]).map((r) => r.version),
  );
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.exec(m.sql);
    db.prepare('insert into schema_migrations (version, applied_at) values (?, ?)').run(m.version, Date.now());
  }
}
