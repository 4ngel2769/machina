/**
 * Snapshot panel for one instance: list, create, revert and delete.
 */
'use client';

import { SnapConfirm, SnapHead, SnapNew, SnapTable } from './snapshots/view';
import { useSnapshots } from './snapshots/use';

export function SnapshotsPanel({
  instanceId,
  instanceStatus,
}: {
  instanceId: string;
  instanceStatus: string;
}) {
  const s = useSnapshots(instanceId);
  const live = instanceStatus === 'running';
  const canAct = instanceStatus !== 'provisioning';

  return (
    <div className="snapwrap">
      <SnapHead snaps={s.snaps} disk={s.disk} planDiskGb={s.planDiskGb} busy={s.busy} confirm={s.confirm} />

      {s.msg && <div className="notice err" style={{ marginBottom: 12 }}>{s.msg}</div>}

      {canAct && <SnapNew s={s} live={live} canAct={canAct} />}

      {s.confirm && <SnapConfirm s={s} mode={s.confirm} />}

      <SnapTable s={s} canAct={canAct} />
    </div>
  );
}
