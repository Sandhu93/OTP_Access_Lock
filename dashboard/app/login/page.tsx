import Image from 'next/image';

export default function LoginPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || '';
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <Image className="login-brand-logo" src="/muthoot-finance-logo.png" alt="Muthoot Finance" width={240} height={78} priority />
        <p className="topbar-kicker">SECURE ACCESS CONTROL</p>
        <h1 id="login-title">Sign in to the secure control center</h1>
        <p className="login-copy">
          Use your organization&apos;s identity provider. Passwords and MFA are handled by the
          configured OIDC provider, not by this dashboard.
        </p>
        <a className="primary-button login-button" href={`${apiBase}/api/v1/auth/login`}>
          Continue with organization SSO
        </a>
        <p className="login-note">Authentication and MFA are handled by the configured OIDC provider.</p>
        <a className="login-back" href="/">Open labelled demo workspace</a>
      </section>
    </main>
  );
}
