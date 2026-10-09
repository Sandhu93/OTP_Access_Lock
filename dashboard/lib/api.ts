const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || '';

export type AuthMembership = {tenant_id: string; tenant_name: string; role: string};
export type AuthMe = {authenticated: boolean; user?: {id: number; email: string; name: string}; memberships?: AuthMembership[]};
export type AuthConfig = {mode: 'oidc' | 'password_demo'};
export type ApiOverview = {tenant: {id: string; name: string}; lockers: {total: number; online: number; attention: number}; requests: {pending_review: number; active: number}};
export type ApiUnlockRequest = {
  id: string; locker: string; locker_name: string; site_name: string; requester: string; requester_name: string;
  second_party: string | null; second_party_name: string | null; status: string; reason: string;
  admin_review_reason: string; requested_at: string; expires_at: string | null; otp_challenge_id: string | null; otp_delivery_status: string | null;
};
export type ApiLocker = {id: string; name: string; hardware_id: string; site: string; site_name: string; status: string; last_seen_at: string | null; firmware_version: string; policy?: {required_count: number; enrolled_count: number}};
export type ApiSite = {id: string; name: string; region: string; status: string};
export type ApiUser = {id: string; display_name: string; employee_id: string; title: string; status: string; created_at: string};
export type ApiDevice = {id: string; user: string; user_name: string; platform: string; status: string; last_seen_at: string | null; revoked_at: string | null};
export type ApiAuditEvent = {id: string; actor_type: string; actor_id: string; event_type: string; request_id: string | null; details: Record<string, unknown>; created_at: string};
export type ApiAlert = {id: string; locker: string | null; severity: string; category: string; message: string; acknowledged_at: string | null; created_at: string};

async function csrfToken() {
  const response = await fetch(`${configuredApiBase}/api/v1/auth/csrf`, {credentials: 'include'});
  if (!response.ok) throw new Error('Could not initialize secure sign-in. Refresh and try again.');
  const body = await response.json() as {csrfToken?: string};
  return body.csrfToken ?? '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrf = method === 'GET' ? '' : await csrfToken();
  const response = await fetch(`${configuredApiBase}${path}`, {
    ...init,
    credentials: 'include',
    headers: {'Content-Type': 'application/json', ...(csrf ? {'X-CSRFToken': csrf} : {}), ...(init?.headers ?? {})},
  });
  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? '';
    let detail = '';
    if (contentType.includes('application/json')) {
      const body = await response.json().catch(() => null) as {detail?: string; message?: string} | null;
      detail = body?.detail || body?.message || '';
    }
    throw new Error(`API request failed with status ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function tenantHeaders(tenantId: string): HeadersInit {
  return {'X-Tenant-ID': tenantId};
}

export const dashboardApi = {
  getAuthConfig: () => request<AuthConfig>('/api/v1/auth/config'),
  getAuthMe: () => request<AuthMe>('/api/v1/auth/me'),
  passwordLogin: (username: string, password: string) => request<{authenticated: boolean}>(
    '/api/v1/auth/password-login', {method: 'POST', body: JSON.stringify({username, password})},
  ),
  logout: () => request<{authenticated: boolean}>('/api/v1/auth/logout', {method: 'POST', body: JSON.stringify({})}),
  getOverview: (tenantId: string) => request<ApiOverview>('/api/v1/admin/overview', {headers: tenantHeaders(tenantId)}),
  getRequests: (tenantId: string) => request<ApiUnlockRequest[]>('/api/v1/admin/unlock-requests/', {headers: tenantHeaders(tenantId)}),
  getLockers: (tenantId: string) => request<ApiLocker[]>('/api/v1/admin/lockers/', {headers: tenantHeaders(tenantId)}),
  getSites: (tenantId: string) => request<ApiSite[]>('/api/v1/admin/sites/', {headers: tenantHeaders(tenantId)}),
  getUsers: (tenantId: string) => request<ApiUser[]>('/api/v1/admin/users/', {headers: tenantHeaders(tenantId)}),
  getDevices: (tenantId: string) => request<ApiDevice[]>('/api/v1/admin/devices/', {headers: tenantHeaders(tenantId)}),
  getAuditEvents: (tenantId: string) => request<ApiAuditEvent[]>('/api/v1/admin/audit-events/', {headers: tenantHeaders(tenantId)}),
  getAlerts: (tenantId: string) => request<ApiAlert[]>('/api/v1/admin/alerts/', {headers: tenantHeaders(tenantId)}),
  approveUnlockRequest: (tenantId: string, requestId: string, reason: string) => request<ApiUnlockRequest>(
    `/api/v1/admin/unlock-requests/${requestId}/approve/`,
    {method: 'POST', headers: tenantHeaders(tenantId), body: JSON.stringify({reason})},
  ),
  rejectUnlockRequest: (tenantId: string, requestId: string, reason: string) => request<ApiUnlockRequest>(
    `/api/v1/admin/unlock-requests/${requestId}/reject/`,
    {method: 'POST', headers: tenantHeaders(tenantId), body: JSON.stringify({reason})},
  ),
  revokeUser: (tenantId: string, userId: string) => request<ApiUser>(`/api/v1/admin/users/${userId}/revoke/`, {method: 'POST', headers: tenantHeaders(tenantId), body: JSON.stringify({})}),
  revokeDevice: (tenantId: string, deviceId: string) => request<ApiDevice>(`/api/v1/admin/devices/${deviceId}/revoke/`, {method: 'POST', headers: tenantHeaders(tenantId), body: JSON.stringify({})}),
};
