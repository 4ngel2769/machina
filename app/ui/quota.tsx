/**
 * Quota editor used by the admin console.
 */
'use client';

import { useQuotaEdit } from './quota/edit';
import { QuotaRows } from './quota/row';
import type { Row } from './quota/types';

type Props = {
  data: { rows: Row[]; host: unknown };
  onSaved: () => void;
};

export function QuotaEditor({ data, onSaved }: Props) {
  const edit = useQuotaEdit(onSaved);
  const rows = data.rows;
  return (
    <table className="quotatable">
      <thead>
        <tr><th>account</th><th>usage</th><th>state</th><th /></tr>
      </thead>
      <tbody>
        <QuotaRows rows={rows} edit={edit} />
      </tbody>
    </table>
  );
}
