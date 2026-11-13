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
];
