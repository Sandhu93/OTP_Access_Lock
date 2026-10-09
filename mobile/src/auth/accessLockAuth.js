import React, {useCallback, useEffect, useState} from 'react';
import {Linking, NativeModules, Platform} from 'react-native';
import {MOBILE_PUBLIC_ORIGIN} from '../config/localDemo';

export const MOBILE_API_BASE_URL = MOBILE_PUBLIC_ORIGIN;
export const OIDC_ISSUER = `${MOBILE_PUBLIC_ORIGIN}/realms/access-lock`;
export const OIDC_CLIENT_ID = 'access-lock-mobile';
export const OIDC_REDIRECT_URI = 'accesslock://oauth/callback';

const SESSION_KEY = 'oidc_session';
const PENDING_KEY = 'oidc_pending';
const secureStore = NativeModules.AccessLockSecureStore;

async function readJson(key) {
  const value = await secureStore.getItem(key);
  return value ? JSON.parse(value) : null;
}

async function writeJson(key, value) {
  await secureStore.setItem(key, JSON.stringify(value));
}

function formBody(values) {
  return Object.entries(values)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function readQuery(query) {
  return new Map(query.split('&').filter(Boolean).map(part => {
    const [key, ...rest] = part.split('=');
    return [decodeURIComponent(key), decodeURIComponent(rest.join('=').replace(/\+/g, ' '))];
  }));
}

async function exchangeCode(code, verifier) {
  const response = await fetch(`${OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: formBody({
      grant_type: 'authorization_code',
      client_id: OIDC_CLIENT_ID,
      redirect_uri: OIDC_REDIRECT_URI,
      code,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) {
    throw new Error(`OIDC token exchange failed (${response.status})`);
  }
  return response.json();
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch(`${OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: formBody({grant_type: 'refresh_token', client_id: OIDC_CLIENT_ID, refresh_token: refreshToken}),
  });
  if (!response.ok) {
    throw new Error(`OIDC token refresh failed (${response.status})`);
  }
  return response.json();
}

function expiresSoon(session) {
  return !session?.accessToken || !session?.accessTokenExpirationDate || Date.parse(session.accessTokenExpirationDate) < Date.now() + 60_000;
}

export function useAccessLockAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const consumeCallback = useCallback(async url => {
    if (!url || !url.startsWith(OIDC_REDIRECT_URI)) return false;
    const query = url.split('?')[1] || '';
    const params = readQuery(query);
    const pending = await readJson(PENDING_KEY);
    await secureStore.removeItem(PENDING_KEY);
    if (params.get('error')) throw new Error(params.get('error_description') || params.get('error'));
    if (!pending || params.get('state') !== pending.state || !params.get('code')) {
      throw new Error('OIDC callback state validation failed');
    }
    const token = await exchangeCode(params.get('code'), pending.verifier);
    const next = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpirationDate: new Date(Date.now() + (token.expires_in || 300) * 1000).toISOString(),
      idToken: token.id_token || '',
    };
    await writeJson(SESSION_KEY, next);
    setSession(next);
    setError('');
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    readJson(SESSION_KEY)
      .then(value => { if (active) setSession(value); })
      .catch(nextError => { if (active) setError(nextError.message); })
      .finally(() => { if (active) setLoading(false); });

    const subscription = Linking.addEventListener('url', ({url}) => {
      consumeCallback(url).catch(nextError => setError(nextError.message));
    });
    Linking.getInitialURL().then(url => {
      if (url) consumeCallback(url).catch(nextError => setError(nextError.message));
    });
    return () => { active = false; subscription.remove(); };
  }, [consumeCallback]);

  const signIn = useCallback(async () => {
    try {
      if (Platform.OS !== 'android') throw new Error('This local demo currently supports Android only');
      const pkce = await secureStore.createPkce();
      await writeJson(PENDING_KEY, pkce);
      const params = {
        client_id: OIDC_CLIENT_ID,
        redirect_uri: OIDC_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid profile email',
        prompt: 'login',
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        state: pkce.state,
      };
      await Linking.openURL(`${OIDC_ISSUER}/protocol/openid-connect/auth?${formBody(params)}`);
    } catch (error) {
      setError(error?.message || 'Unable to start sign-in');
      throw error;
    }
  }, []);

  const getAccessToken = useCallback(async () => {
    let current = await readJson(SESSION_KEY);
    if (!current) return '';
    if (expiresSoon(current) && current.refreshToken) {
      const token = await refreshAccessToken(current.refreshToken);
      current = {
        ...current,
        accessToken: token.access_token,
        refreshToken: token.refresh_token || current.refreshToken,
        accessTokenExpirationDate: new Date(Date.now() + (token.expires_in || 300) * 1000).toISOString(),
      };
      await writeJson(SESSION_KEY, current);
      setSession(current);
    }
    return current.accessToken;
  }, []);

  const signOut = useCallback(async () => {
    await secureStore.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  return {session, loading, error, isSignedIn: Boolean(session?.accessToken), signIn, signOut, getAccessToken};
}

// SECURITY-PLACEHOLDER: local demo device registration uses a Keystore-protected random fingerprint,
// not a hardware-attested signing key; replace with the reviewed enrollment ceremony before production. See TODO_SECURITY_DEBT.md
