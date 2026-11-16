/**
 * DataGate: the one loading gate every data page uses.
 *
 * Pages keep their own fetch hooks (they need the data for mutations and
 * polling anyway); DataGate is the render decision they all hand-roll today:
 *
 *   error    -> error row with a retry button (calls onRetry)
 *   loading  -> skeleton (caller picks the shape; default is a block)
 *   isEmpty  -> <Empty> with the caller's icon/text/action
 *   loaded   -> children(data)
 *
 * `isEmpty` defaults to falsy data; pass a predicate for arrays/objects.
 * The min-visible delay lives in the caller's hook (useMinVisible) and folds
 * into `loading`, so a fast fetch still cannot flash skeleton->content.
 */
'use client';

import { Empty } from './loaders';
import { Skeleton } from './loaders';
import type { IconName } from './icons';

type GateProps<T> = {
  data: T | null | undefined;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  isEmpty?: (data: T) => boolean;
  skeleton?: React.ReactNode;
  emptyIcon?: IconName;
  emptyText?: string;
  emptyAction?: React.ReactNode;
  children: (data: T) => React.ReactNode;
};

export function DataGate<T>({
  data, loading, error, onRetry, isEmpty, skeleton,
  emptyIcon = 'inbox', emptyText = 'nothing here yet', emptyAction, children,
}: GateProps<T>) {
  if (error) return <GateError error={error} onRetry={onRetry} />;
  if (loading || data === null || data === undefined) {
    return <>{skeleton ?? <Skeleton h={120} />}</>;
  }
  const empty = isEmpty ? isEmpty(data) : !data;
  if (empty) return <Empty icon={emptyIcon} text={emptyText} action={emptyAction} />;
  return <>{children(data)}</>;
}

/** Error branch, split out so DataGate stays under the complexity cap. */
function GateError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="card">
      <div className="empty">
        <div className="empty-text">{error}</div>
        {onRetry && <div style={{ marginTop: 12 }}><button onClick={onRetry}>retry</button></div>}
      </div>
    </div>
  );
}
