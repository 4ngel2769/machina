import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <>
      <h1>privacy policy</h1>
      <div className="sub">last updated 17 October 2026</div>

      <div className="card prose">
        <p>This platform runs on private infrastructure and collects the minimum data needed to operate accounts, virtual machines and billing. It is not a public service and is not indexed.</p>

        <h3>what we store</h3>
        <p>Your username, a hashed password (never in plain text), your credit balance and transaction ledger, the virtual machines you own and their usage samples, any SSH public keys you add, and a security audit trail of administrative actions. We do not store payment details — the credit system is internal.</p>

        <h3>what we do not do</h3>
        <p>We do not sell or share your data, run advertising or analytics trackers, or collect personal information beyond what is required to run the platform. The site sets no third-party cookies.</p>

        <h3>session and security data</h3>
        <p>Sessions are held in a signed, HTTP-only cookie. Web-terminal access uses short-lived, single-use tokens bound to your account. Login attempts are rate-limited, and IP addresses may appear in rate-limiting records and security logs.</p>

        <h3>your rights</h3>
        <p>You can view and change your password, and export all of your data as JSON, from your account page at any time. You can also request permanent deletion of your account and all associated data; an administrator completes the request, which destroys your instances and erases your personal data. See the <Link href="/terms" style={{ color: 'var(--accent)' }}>terms</Link>.</p>
      </div>
    </>
  );
}
