import Link from 'next/link';

export default function TermsPage() {
  return (
    <>
      <h1>terms of use</h1>
      <div className="sub">last updated 17 October 2026</div>

      <div className="card prose">
        <p>This is an internal, invitation-only virtual-machine platform operated on private infrastructure. By using an account you agree to the terms below.</p>

        <h3>accounts</h3>
        <p>Accounts are issued by an administrator and are personal. You are responsible for everything done under your account, including any virtual machine you run. Do not share credentials.</p>

        <h3>acceptable use</h3>
        <p>Instances must not be used for anything unlawful, for resale, for crypto mining, for sending unsolicited bulk email or scanning third-party systems. You may not use an instance to attack, probe or gain access to the host machine, the operator's network, or any other instance.</p>

        <h3>billing</h3>
        <p>Virtual machines are metered per hour of running time against a prepaid internal credit balance. Usage is sampled periodically and settled hourly. When the balance reaches zero, instances are suspended; they resume when the balance is replenished. Unused balance is not refundable. Rates may change with reasonable notice.</p>

        <h3>availability and data</h3>
        <p>The platform is provided as-is and without warranty. Virtual machine disks may be reset or destroyed for maintenance, abuse, or quota enforcement. You are responsible for your own data and backups. The operator may terminate accounts or instances that violate these terms.</p>

        <h3>termination and deletion</h3>
        <p>You may request deletion of your account and data at any time from your account page; deletion is completed by an administrator. Deletion destroys your instances and erases your personal data.</p>

        <p>Questions go to the operator. See also the <Link href="/privacy" style={{ color: 'var(--accent)' }}>privacy policy</Link>.</p>
      </div>
    </>
  );
}
