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
  const snapshots = useSnapshots(instanceId);
  const live = instanceStatus === 'running';
  const canAct = instanceStatus !== 'provisioning';

  return (
    <div className="snapwrap">
      <SnapHead snaps={snapshots.snaps} disk={snapshots.disk} planDiskGb={snapshots.planDiskGb} busy={snapshots.busy} confirm={snapshots.confirm} />

      {snapshots.msg && <div className="notice err" style={{ marginBottom: 12 }}>{snapshots.msg}</div>}

      {canAct && <SnapNew snapshots={snapshots} live={live} canAct={canAct} />}

      {snapshots.confirm && <SnapConfirm snapshots={snapshots} mode={snapshots.confirm} />}

      <SnapTable snapshots={snapshots} canAct={canAct} />
    </div>
  );
}
