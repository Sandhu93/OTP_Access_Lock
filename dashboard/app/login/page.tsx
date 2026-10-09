'use client';

import Image from 'next/image';
import {FormEvent, useEffect, useState} from 'react';
import {dashboardApi, type AuthConfig} from '@/lib/api';

export default function LoginPage() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    dashboardApi.getAuthConfig()
      .then((config) => { if (active) setAuthConfig(config); })
      .catch(() => { if (active) setError('Could not reach the sign-in service. Check the API URL and try again.'); });
    const queryError = new URLSearchParams(window.location.search).get('error');
    if (queryError) setError(queryError.replaceAll('_', ' '));
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await dashboardApi.passwordLogin(username.trim(), password);
      window.location.assign('/');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign-in failed. Check your credentials.');
      setBusy(false);
    }
  };

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || '';
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <Image className="login-brand-logo" src="/muthoot-finance-logo.png" alt="Muthoot Finance" width={240} height={78} priority />
        <p className="topbar-kicker">SECURE ACCESS CONTROL</p>
        <h1 id="login-title">Sign in to the control center</h1>
        {authConfig?.mode === 'password_demo' ? (
          <>
            <p className="login-copy">Use the temporary demo account assigned to your organization.</p>
            <form className="login-form" onSubmit={submit}>
              <label htmlFor="username">Username</label>
              <input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              {error ? <p className="login-error" role="alert">{error}</p> : null}
              <button className="primary-button login-button" type="submit" disabled={busy || !username || !password}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p className="login-note demo-auth-note">Temporary password-only demo mode. Do not use for production access.</p>
          </>
        ) : authConfig?.mode === 'oidc' ? (
          <>
            <p className="login-copy">Sign in with your organization identity provider. Authentication policy is managed by your identity provider.</p>
            {error ? <p className="login-error" role="alert">{error}</p> : null}
            <a className="primary-button login-button" href={`${apiBase}/api/v1/auth/login`}>Continue with organization SSO</a>
          </>
        ) : (
          <p className="login-copy" role="status">Connecting to the authentication service…</p>
        )}
      </section>
    </main>
  );
}
