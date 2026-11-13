/**
 * Later migrations, split from migrations.ts to stay under the line budget.
 * initDb.ts concatenates MIGRATIONS_1 + MIGRATIONS_2 in this order.
 */

export const MIGRATIONS_2: { version: string; sql: string }[] = [
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
  {
    version: '20261103_0009',
    sql: `
      -- Custom specs. A plan row is the unit of size in this schema (instances
      -- carry plan_id, quotas sum plan vcpu/ram/disk, the domain XML and the
      -- qcow2 overlay are sized from the plan snapshot), so a non-preset VM is
      -- a plan row that exists for one box. custom=1 keeps those out of the
      -- catalog and the user request form without inventing a second sizing
      -- path that would drift from this one.
      alter table plans add column custom integer not null default 0;
    `,
  },
  {
    version: '20261113_0010',
    sql: `
      -- In-app notification feed. One row per event worth telling a user
      -- about; read_at null means unread. kind drives icon + colour only.
      create table if not exists notifications (
        id text primary key,
        user_id text not null,
        kind text not null default 'info',
        title text not null,
        body text not null default '',
        link text,
        read_at integer,
        created_at integer not null
      );
      create index if not exists notif_user_idx on notifications(user_id, read_at);

      -- Personal access tokens for the API. Only the sha256 of the secret is
      -- stored; the plaintext is shown once at mint time. scopes is a JSON
      -- array of permission strings checked per-route.
      create table if not exists api_tokens (
        id text primary key,
        user_id text not null,
        name text not null,
        prefix text not null,
        hash text not null,
        scopes text not null default '[]',
        last_used_at integer,
        expires_at integer,
        revoked_at integer,
        created_at integer not null
      );
      create index if not exists apitok_user_idx on api_tokens(user_id);
      create unique index if not exists apitok_hash_idx on api_tokens(hash);

      -- Per-sample bandwidth counters so the UI can draw a rate graph instead
      -- of only showing the monthly total. 15-minute deltas per instance.
      create table if not exists net_samples (
        instance_id text not null,
        ts integer not null,
        rx_delta integer not null default 0,
        tx_delta integer not null default 0,
        primary key (instance_id, ts)
      );
      create index if not exists netsamp_ts_idx on net_samples(ts);

    `,
  },
  {
    version: '20261113_0011',
    sql: `
      -- Scheduled operations: a user asks for a lifecycle action at a future
      -- time (once, daily at HH:MM, or weekly on a weekday). The worker's
      -- scheduler pass enqueues the real job when next_run comes due.
      create table if not exists scheduled_ops (
        id text primary key,
        user_id text not null,
        instance_id text not null,
        action text not null,           -- start | stop
        run_at integer,                 -- one-shot: epoch ms
        daily_time text,                -- 'HH:MM' local server time, daily
        weekly_dow integer,             -- 0=Sun..6=Sat, with daily_time
        next_run integer not null,
        last_run integer,
        status text not null default 'active', -- active | done | failed | cancelled
        last_error text,
        created_at integer not null
      );
      create index if not exists schedue_due_idx on scheduled_ops(status, next_run);
      create index if not exists schedue_user_idx on scheduled_ops(user_id);
    `,
  },
  {
    version: '20261113_0012',
    sql: `
      -- Admin-editable runtime settings (JSON values). Today only the ISO
      -- library caps live here; the config.ts defaults remain the fallback so
      -- a missing row never changes behaviour.
      create table if not exists settings (
        key text primary key,
        value text not null
      );

      -- One private libvirt NAT network per user. VMs of the same user share
      -- it (they can reach each other); different users land on different
      -- /24s and the host firewall drops all cross-bridge forwarding, so a
      -- guest cannot route to another tenant's VM, the host, or the LAN.
      create table if not exists user_nets (
        user_id text primary key,
        name text not null unique,
        idx integer not null,
        subnet text not null,      -- e.g. 10.231.7.0/24
        gateway text not null,     -- e.g. 10.231.7.1
        created_at integer not null
      );

      -- Which network an instance's NIC is attached to. Defaults to the
      -- legacy shared machina0 net so pre-migration rows keep working; new
      -- provisions always write their user net here.
      alter table instances add column net_name text not null default 'machina0';
      create index if not exists inst_net_idx on instances(net_name);
    `,
  },
  {
    version: '20261113_0013',
    sql: `
      -- Per-user ISO library tiers: same "NULL = unlimited, 0 = none"
      -- semantics as the VM columns. The global caps in iso.limits remain
      -- the hard ceiling every upload must also fit inside.
      alter table quotas add column max_iso_count integer;
      alter table quotas add column max_iso_total_gb integer;
      alter table quotas add column max_containers integer;
      alter table quotas add column max_container_mem_mb integer;
      alter table quotas add column max_container_cpus real;

      -- Ownership registry for ISO uploads. The files live in one shared
      -- directory; this table is what makes a library per-user. One row per
      -- filename, so rename and quota accounting stay simple.
      create table if not exists iso_uploads (
        name text primary key,
        owner_id text not null,
        size_bytes integer not null default 0,
        created_at integer not null
      );
      create index if not exists isou_owner_idx on iso_uploads(owner_id);

      -- One private docker bridge per user for tenant containers. idx picks
      -- the 10.240.<idx>.0/24 subnet; the machina_vnets-style isolation comes
      -- free because docker bridges never route to each other.
      create table if not exists user_dockernets (
        user_id text primary key,
        name text not null unique,
        idx integer not null,
        subnet text not null,
        created_at integer not null
      );

      -- Registry of containers a user created through the console. Docker is
      -- the source of truth for state; this table answers "who owns it" for
      -- listing, quotas and cleanup after the container is gone.
      create table if not exists user_containers (
        id text primary key,          -- docker container id
        user_id text not null,
        name text not null,
        net_name text,
        memory_mb integer default 0,
        cpus real default 0,
        created_at integer not null
      );
      create index if not exists uct_user_idx on user_containers(user_id);
    `,
  },
];
