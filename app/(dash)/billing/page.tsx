/**
 * Billing page: balance, ledger history and hourly usage.
 */
'use client';

import { BalanceCard, ForecastCard, LedgerCard, PasswordCard } from './cards';
import { useBilling } from './use';

export default function BillingPage() {
  const b = useBilling();

  return (
    <>
      <h1>billing</h1>
      <div className="sub">balance, usage forecast, ledger, credentials</div>

      <BalanceCard b={b} />
      <ForecastCard b={b} />
      <PasswordCard b={b} />
      <LedgerCard b={b} />
    </>
  );
}
