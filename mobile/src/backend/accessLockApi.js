// Backend client boundary for the authenticated mobile flow.
// The caller supplies the access token obtained through OIDC Authorization Code + PKCE.

import {MOBILE_PUBLIC_ORIGIN} from '../config/localDemo';

const DEFAULT_API_BASE_URL = MOBILE_PUBLIC_ORIGIN;

export function createAccessLockApi({baseUrl = DEFAULT_API_BASE_URL, getAccessToken, getDeviceId = async () => ''}) {
  async function request(path, init = {}) {
    const token = await getAccessToken();
    const headers = {'Content-Type': 'application/json', ...(init.headers || {})};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const deviceId = await getDeviceId();
    if (deviceId) {
      headers['X-Device-ID'] = deviceId;
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {...init, headers});
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
      const error = new Error(body?.detail || `Access Lock API request failed (${response.status})`);
      error.status = response.status;
      error.errorCode = body?.error_code || '';
      error.body = body;
      throw error;
    }
    if (response.status === 204) {
      return null;
    }
    return response.json();
  }

  return {
    registerDevice: (payload) => request('/api/v1/mobile/devices/register', {method: 'POST', body: JSON.stringify(payload)}),
    createUnlockRequest: (payload) => request('/api/v1/mobile/unlock-requests', {method: 'POST', body: JSON.stringify(payload)}),
    listUnlockRequests: () => request('/api/v1/mobile/unlock-requests'),
    getUnlockRequest: (requestId) => request(`/api/v1/mobile/unlock-requests/${requestId}`),
    createPresenceSession: (payload) => request('/api/v1/mobile/presence-sessions', {method: 'POST', body: JSON.stringify(payload)}),
    heartbeatPresence: (sessionId, payload = {}) => request(`/api/v1/mobile/presence-sessions/${sessionId}/heartbeat`, {method: 'PATCH', body: JSON.stringify(payload)}),
    endPresenceSession: (sessionId) => request(`/api/v1/mobile/presence-sessions/${sessionId}`, {method: 'DELETE'}),
    getOtpChallenge: (challengeId) => request(`/api/v1/mobile/otp-challenges/${challengeId}`),
    verifyOtpChallenge: (challengeId, otp) => request(`/api/v1/mobile/otp-challenges/${challengeId}/verify`, {method: 'POST', body: JSON.stringify({otp})}),
  };
}
