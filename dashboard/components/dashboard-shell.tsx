'use client';

import {useEffect, useMemo, useState} from 'react';
import type {ReactNode} from 'react';
import Image from 'next/image';
import {dashboardApi, type ApiAlert, type ApiAuditEvent, type ApiDevice, type ApiLocker, type ApiOverview, type ApiSite, type ApiUnlockRequest, type ApiUser, type AuthMe} from '@/lib/api';

type View = 'overview' | 'requests' | 'lockers' | 'people' | 'audit';
type RequestStatus = 'Pending review' | 'Approved / waiting' | 'Verifying' | 'Token issued' | 'Actuated' | 'Rejected' | 'OTP locked out' | 'Expired' | 'Aborted';
type UnlockRequest = {id: string; locker: string; site: string; requester: string; requesterInitials: string; secondParty: string; reason: string; status: RequestStatus; requestedAt: string; expiresIn: string; otpDeliveryStatus: string};

const navigation: {id: View; label: string; icon: string}[] = [
  {id: 'overview', label: 'Overview', icon: '⌂'},
  {id: 'requests', label: 'Access requests', icon: '◈'},
  {id: 'lockers', label: 'Lockers & sites', icon: '▣'},
  {id: 'people', label: 'People & devices', icon: '♙'},
  {id: 'audit', label: 'Audit & security', icon: '◌'},
];

function formatRelative(value: string | null) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`;
  return new Date(value).toLocaleDateString();
}

function formatExpiry(value: string | null) {
  if (!value) return 'Closed';
  const minutes = Math.ceil((new Date(value).getTime() - Date.now()) / 60000);
  return minutes <= 0 ? 'Expired' : `${minutes} min`;
}

function mapStatus(value: string): RequestStatus {
  const labels: Record<string, RequestStatus> = {
    pending_review: 'Pending review', approved_waiting_second_party: 'Approved / waiting', presence_verifying: 'Verifying',
    token_issued: 'Token issued', actuated: 'Actuated', rejected: 'Rejected', otp_locked_out: 'OTP locked out', expired: 'Expired', aborted: 'Aborted',
  };
  return labels[value] ?? 'Pending review';
}

function mapRequest(item: ApiUnlockRequest): UnlockRequest {
  const name = item.requester_name || item.requester;
  const terminal = new Set(['rejected', 'expired', 'otp_locked_out', 'actuated', 'aborted']);
  const expired = Boolean(item.expires_at && new Date(item.expires_at).getTime() <= Date.now() && !terminal.has(item.status));
  return {id: item.id, locker: item.locker_name || item.locker, site: item.site_name, requester: name, requesterInitials: name.split(' ').map((part) => part[0]).join('').slice(0, 2), secondParty: item.second_party_name || 'Not assigned', reason: item.reason, status: expired ? 'Expired' : mapStatus(item.status), requestedAt: formatRelative(item.requested_at), expiresIn: formatExpiry(item.expires_at), otpDeliveryStatus: item.otp_delivery_status || 'not_started'};
}

function Icon({name}: {name: string}) { return <span className="icon" aria-hidden="true">{name}</span>; }
function Avatar({initials}: {initials: string}) { return <span className="avatar" aria-hidden="true">{initials}</span>; }

function StatusPill({status}: {status: string}) {
  const normalized = status.toLowerCase();
  const tone = normalized.includes('online') || normalized.includes('approved') || normalized.includes('active') || normalized.includes('actuated') || normalized.includes('delivered')
    ? 'success' : normalized.includes('warning') || normalized.includes('pending') || normalized.includes('waiting') || normalized.includes('verifying')
      ? 'warning' : normalized.includes('offline') || normalized.includes('rejected') || normalized.includes('expired') || normalized.includes('locked') || normalized.includes('revoked')
        ? 'danger' : 'neutral';
  return <span className={`status-pill ${tone}`}><span className="status-dot" />{status}</span>;
}

function MetricCard({label, value, detail, tone = 'blue'}: {label: string; value: string; detail: string; tone?: string}) {
  return <article className={`metric-card ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><span className="metric-detail">{detail}</span></article>;
}

function SectionHeading({eyebrow, title, detail, action}: {eyebrow: string; title: string; detail: string; action?: ReactNode}) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{detail}</p></div>{action}</div>;
}

function RequestTable({requests, onSelect}: {requests: UnlockRequest[]; onSelect: (request: UnlockRequest) => void}) {
  return <div className="table-wrap"><table><thead><tr><th>Request</th><th>Requester</th><th>Locker</th><th>Created</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{requests.length ? requests.map((request) => <tr key={request.id}><td><button className="table-link" onClick={() => onSelect(request)}>{request.id}</button><span className="cell-subtle">{request.reason}</span></td><td><span className="person-cell"><Avatar initials={request.requesterInitials} /><span>{request.requester}</span></span></td><td><span>{request.locker}</span><span className="cell-subtle">{request.site}</span></td><td><span>{request.requestedAt}</span><span className="cell-subtle">{request.expiresIn} remaining</span></td><td><StatusPill status={request.status} /></td><td><button className="icon-button" aria-label={`Open ${request.id}`} onClick={() => onSelect(request)}>→</button></td></tr>) : <tr><td colSpan={6}><span className="cell-subtle">No requests in this tenant.</span></td></tr>}</tbody></table></div>;
}

function AuditList({events, compact = false}: {events: ApiAuditEvent[]; compact?: boolean}) {
  return <div className={`audit-list ${compact ? 'compact' : ''}`}>{events.length ? events.map((event) => <div className="audit-row" key={event.id}><span className="audit-marker" /><div><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{event.request_id ? `Request ${event.request_id}` : JSON.stringify(event.details)}</span></div><div className="audit-meta"><span>{event.actor_type}</span><time>{formatRelative(event.created_at)}</time></div></div>) : <p className="cell-subtle">No audit events recorded.</p>}</div>;
}

function OverviewView({overview, requests, lockers, alerts, events, onSelect, onNavigate}: {overview: ApiOverview; requests: UnlockRequest[]; lockers: ApiLocker[]; alerts: ApiAlert[]; events: ApiAuditEvent[]; onSelect: (request: UnlockRequest) => void; onNavigate: (view: View) => void}) {
  const pending = requests.filter((request) => request.status === 'Pending review');
  return <><div className="metrics-grid"><MetricCard label="Needs review" value={String(pending.length).padStart(2, '0')} detail="Requests waiting for a decision" tone="blue" /><MetricCard label="Lockers online" value={`${overview.lockers.online} / ${overview.lockers.total}`} detail={`${overview.lockers.attention} need attention`} tone="green" /><MetricCard label="Active requests" value={String(overview.requests.active).padStart(2, '0')} detail="Presence or authorization in progress" tone="violet" /><MetricCard label="Security events" value={String(alerts.length).padStart(2, '0')} detail="Alerts requiring review" tone="amber" /></div><div className="content-grid two-col"><section className="panel request-panel"><SectionHeading eyebrow="Control queue" title="Access requests" detail="Review the reason, participants, and locker state before approving." action={<button className="quiet-button" onClick={() => onNavigate('requests')}>View all <span>→</span></button>} /><RequestTable requests={pending} onSelect={onSelect} /></section><section className="panel health-panel"><SectionHeading eyebrow="Fleet health" title="Locker status" detail="Connectivity is telemetry only; it never authorizes an unlock." action={<button className="quiet-button" onClick={() => onNavigate('lockers')}>Open fleet <span>→</span></button>} /><div className="health-list">{lockers.slice(0, 4).map((locker) => <div className="health-row" key={locker.id}><div><strong>{locker.name}</strong><span>{locker.site_name}</span></div><div className="health-meta"><StatusPill status={locker.status} /><span>{formatRelative(locker.last_seen_at)}</span></div></div>)}</div><div className="security-note"><span className="note-icon">i</span><span>Presence and signed-token verification happen in the backend and lock. This dashboard only records the administrative decision.</span></div></section></div><section className="panel activity-panel"><SectionHeading eyebrow="Latest activity" title="Audit trail" detail="Recent events across this tenant." action={<button className="quiet-button" onClick={() => onNavigate('audit')}>View audit log <span>→</span></button>} /><AuditList events={events.slice(0, 5)} compact /></section></>;
}

function RequestsView({requests, onSelect}: {requests: UnlockRequest[]; onSelect: (request: UnlockRequest) => void}) {
  return <section className="panel page-panel"><SectionHeading eyebrow="Control queue" title="Access requests" detail="Every decision is tenant-scoped and written to the audit trail." action={<span className="status-pill neutral">Live API data</span>} /><RequestTable requests={requests} onSelect={onSelect} /></section>;
}

function LockersView({lockers, sites}: {lockers: ApiLocker[]; sites: ApiSite[]}) {
  return <section className="panel page-panel"><SectionHeading eyebrow="Fleet" title="Lockers & sites" detail="Live connectivity, policies, and enrolled infrastructure from Django." action={<span className="status-pill neutral">{sites.length} sites</span>} /><div className="site-strip"><div><span className="eyebrow">Managed sites</span><strong>{String(sites.length).padStart(2, '0')}</strong></div><div><span className="eyebrow">Online</span><strong className="green-number">{lockers.filter((locker) => locker.status === 'online').length}</strong></div><div><span className="eyebrow">Attention</span><strong className="amber-number">{lockers.filter((locker) => locker.status !== 'online').length}</strong></div></div><div className="locker-grid">{lockers.map((locker) => <article className="locker-card" key={locker.id}><div className="locker-card-head"><div className="locker-symbol">▣</div><StatusPill status={locker.status} /></div><h3>{locker.name}</h3><p>{locker.site_name} · {locker.hardware_id}</p><div className="locker-facts"><span><small>Policy</small>{locker.policy ? `${locker.policy.required_count} of ${locker.policy.enrolled_count}` : '—'}</span><span><small>Firmware</small>{locker.firmware_version || '—'}</span><span><small>Seen</small>{formatRelative(locker.last_seen_at)}</span></div></article>)}</div></section>;
}

function PeopleView({users, devices}: {users: ApiUser[]; devices: ApiDevice[]}) {
  return <section className="panel page-panel"><SectionHeading eyebrow="Identity" title="People & devices" detail="Enrollment is bound to the tenant, locker assignment, and approved device identity." action={<span className="status-pill neutral">{devices.length} devices</span>} /><div className="callout"><span className="note-icon">!</span><div><strong>Device enrollment is a security workflow</strong><p>Revoked devices are rejected by the mobile API. Hardware-backed attestation remains a production requirement.</p></div></div><div className="table-wrap"><table><thead><tr><th>Person</th><th>Employee ID</th><th>Role</th><th>Devices</th><th>Status</th></tr></thead><tbody>{users.map((person) => { const personDevices = devices.filter((device) => device.user === person.id); return <tr key={person.id}><td><span className="person-cell"><Avatar initials={person.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)} /><span>{person.display_name}</span></span></td><td>{person.employee_id}</td><td>{person.title || 'Enrolled person'}</td><td>{personDevices.length} registered</td><td><StatusPill status={person.status} /></td></tr>; })}</tbody></table></div></section>;
}

function AuditView({events, alerts}: {events: ApiAuditEvent[]; alerts: ApiAlert[]}) {
  return <section className="panel page-panel"><SectionHeading eyebrow="Evidence" title="Audit & security" detail="Tamper, emergency, device, and authorization events for this tenant." action={<span className="status-pill neutral">Immutable API history</span>} />{alerts.length ? <div className="alert-grid">{alerts.slice(0, 4).map((alert) => <article className={`alert-card ${alert.severity === 'critical' ? 'danger' : 'warning'}`} key={alert.id}><span className="alert-icon">!</span><div><strong>{alert.category.replaceAll('_', ' ')}</strong><p>{alert.message}</p><span className="cell-subtle">{formatRelative(alert.created_at)}</span></div></article>)}</div> : <div className="security-note"><span className="note-icon">✓</span><span>No active security alerts.</span></div>}<div className="panel-divider" /><SectionHeading eyebrow="Immutable history" title="Recent events" detail="Raw OTPs and signed token material are never shown here." /><AuditList events={events} /></section>;
}

function RequestDrawer({tenantId, request, onClose, onUpdated}: {tenantId: string; request: UnlockRequest; onClose: () => void; onUpdated: (next: UnlockRequest) => void}) {
  const [reason, setReason] = useState('Reviewed against the stated operational need and current enrollment.');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reviewable = request.status === 'Pending review' && request.expiresIn !== 'Expired';
  const reviewComplete = request.status !== 'Pending review';
  const secondPartyComplete = request.otpDeliveryStatus === 'delivered' || ['Verifying', 'Token issued', 'Actuated'].includes(request.status);
  const finalAuthorizationComplete = ['Token issued', 'Actuated'].includes(request.status);
  const reviewText = request.status === 'Pending review' ? 'Decision required' : request.status === 'Expired' ? 'Request expired' : 'Decision recorded';
  const secondPartyText = secondPartyComplete ? 'OTP delivered to the app' : request.status === 'Expired' ? 'No confirmation recorded' : 'OTP delivered only after approval';
  const finalAuthorizationText = finalAuthorizationComplete ? 'Signed grant issued to the locker' : request.status === 'Expired' ? 'Authorization stopped' : 'Backend presence check + signed grant';
  const review = async (approve: boolean) => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const response = approve ? await dashboardApi.approveUnlockRequest(tenantId, request.id, reason) : await dashboardApi.rejectUnlockRequest(tenantId, request.id, reason);
      const next = mapRequest(response);
      setMessage(approve ? 'Approved. OTP delivery was dispatched to the authorized second-party app.' : 'Request rejected and recorded in the audit trail.');
      onUpdated(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The request could not be updated.');
    } finally { setBusy(false); }
  };
  return <div className="drawer-backdrop" role="presentation" onClick={onClose}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="request-title" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><span className="eyebrow">Live unlock request</span><h2 id="request-title">{request.id}</h2></div><button className="icon-button close-button" aria-label="Close request details" onClick={onClose}>×</button></div><div className="drawer-status"><StatusPill status={request.status} /><span>Expires in {request.expiresIn}</span></div><div className="detail-block"><span className="detail-label">Requester</span><div className="person-cell"><Avatar initials={request.requesterInitials} /><div><strong>{request.requester}</strong><span>{request.site}</span></div></div></div><div className="detail-block"><span className="detail-label">Locker</span><strong>{request.locker}</strong><span className="cell-subtle">Tenant-scoped live locker data</span></div><div className="detail-block"><span className="detail-label">Second party</span><strong>{request.secondParty}</strong></div><div className="detail-block"><span className="detail-label">Reason provided</span><p className="reason-copy">{request.reason}</p></div><div className="timeline"><div className="timeline-step complete"><span>✓</span><div><strong>Request submitted</strong><small>{request.requestedAt}</small></div></div><div className={`timeline-step ${reviewComplete ? 'complete' : 'active'}`}><span>{reviewComplete ? '✓' : '2'}</span><div><strong>Administrator review</strong><small>{reviewText}</small></div></div><div className={`timeline-step ${secondPartyComplete ? 'complete' : request.status === 'Approved / waiting' ? 'active' : ''}`}><span>{secondPartyComplete ? '✓' : '3'}</span><div><strong>Second party confirmation</strong><small>{secondPartyText}</small></div></div><div className={`timeline-step ${finalAuthorizationComplete ? 'complete' : request.status === 'Verifying' ? 'active' : ''}`}><span>{finalAuthorizationComplete ? '✓' : '4'}</span><div><strong>Final authorization</strong><small>{finalAuthorizationText}</small></div></div></div><label className="field-label" htmlFor="review-reason">Decision note <span>required</span></label><textarea id="review-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} disabled={!reviewable} /><p className="privacy-note">The backend generates and delivers the OTP. This dashboard never displays or transports it.</p>{message ? <div className="inline-message" role="status">{message}</div> : null}<div className="drawer-actions"><button className="secondary-button" disabled={busy || !reviewable} onClick={() => review(false)}>Reject</button><button className="primary-button" disabled={busy || !reviewable || !reason.trim()} onClick={() => review(true)}>{busy ? 'Saving…' : reviewable ? 'Approve & notify' : request.status === 'Expired' ? 'Request expired' : 'Decision recorded'}</button></div></aside></div>;
}

function AuthWall({message}: {message: string}) { return <main className="login-shell"><section className="login-card"><Image className="login-brand-logo" src="/muthoot-finance-logo.png" alt="Muthoot Finance" width={240} height={78} priority /><p className="topbar-kicker">SECURE ACCESS CONTROL</p><h1>Dashboard sign-in required</h1><p className="login-copy">{message}</p><a className="primary-button login-button" href="/login">Continue to sign in</a></section></main>; }

export default function DashboardShell() {
  const [activeView, setActiveView] = useState<View>('overview');
  const [auth, setAuth] = useState<AuthMe | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [overview, setOverview] = useState<ApiOverview | null>(null);
  const [requests, setRequests] = useState<UnlockRequest[]>([]);
  const [lockers, setLockers] = useState<ApiLocker[]>([]);
  const [sites, setSites] = useState<ApiSite[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [events, setEvents] = useState<ApiAuditEvent[]>([]);
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<UnlockRequest | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let currentTenantId = '';
    async function load(includeAuth = false) {
      try {
        if (includeAuth) {
          const currentAuth = await dashboardApi.getAuthMe();
          if (cancelled) return;
          setAuth(currentAuth);
          if (!currentAuth.authenticated || !currentAuth.memberships?.length) return;
          currentTenantId = currentAuth.memberships[0].tenant_id;
          setTenantId(currentTenantId);
        }
        if (!currentTenantId) return;
        const [currentOverview, currentRequests, currentLockers, currentSites, currentUsers, currentDevices, currentEvents, currentAlerts] = await Promise.all([
          dashboardApi.getOverview(currentTenantId), dashboardApi.getRequests(currentTenantId), dashboardApi.getLockers(currentTenantId), dashboardApi.getSites(currentTenantId), dashboardApi.getUsers(currentTenantId), dashboardApi.getDevices(currentTenantId), dashboardApi.getAuditEvents(currentTenantId), dashboardApi.getAlerts(currentTenantId),
        ]);
        if (cancelled) return;
        const mappedRequests = currentRequests.map(mapRequest);
        setOverview(currentOverview); setRequests(mappedRequests); setLockers(currentLockers); setSites(currentSites); setUsers(currentUsers); setDevices(currentDevices); setEvents(currentEvents); setAlerts(currentAlerts); setError('');
        setSelectedRequest((selected) => selected ? mappedRequests.find((item) => item.id === selected.id) || null : null);
      } catch (loadError) { if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'The live dashboard could not be loaded.'); }
      finally { if (!cancelled && includeAuth) setLoading(false); }
    }
    load(true);
    const timer = setInterval(() => { if (currentTenantId) load(); }, 4000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const tenant = auth?.memberships?.find((membership) => membership.tenant_id === tenantId) ?? auth?.memberships?.[0];
  const pendingCount = useMemo(() => requests.filter((request) => request.status === 'Pending review').length, [requests]);
  const updateRequest = (next: UnlockRequest) => { setRequests((current) => current.map((request) => request.id === next.id ? next : request)); setSelectedRequest(next); };
  const content = overview && (activeView === 'overview' ? <OverviewView overview={overview} requests={requests} lockers={lockers} alerts={alerts} events={events} onSelect={setSelectedRequest} onNavigate={setActiveView} /> : activeView === 'requests' ? <RequestsView requests={requests} onSelect={setSelectedRequest} /> : activeView === 'lockers' ? <LockersView lockers={lockers} sites={sites} /> : activeView === 'people' ? <PeopleView users={users} devices={devices} /> : <AuditView events={events} alerts={alerts} />);

  if (loading) return <main className="login-shell"><section className="login-card"><Image className="login-brand-logo" src="/muthoot-finance-logo.png" alt="Muthoot Finance" width={240} height={78} priority /><p className="topbar-kicker">SECURE ACCESS CONTROL</p><h1>Loading live control plane</h1><p className="login-copy">Reading tenant-scoped data from Django…</p></section></main>;
  if (!auth?.authenticated) return <AuthWall message="The dashboard now reads live data and requires an authenticated administrator session." />;
  if (!tenant || !overview) return <AuthWall message={error || 'No active tenant is assigned to this administrator.'} />;

  return <div className="app-shell"><aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}><div className="brand"><Image className="brand-logo" src="/muthoot-finance-logo.png" alt="Muthoot Finance" width={138} height={42} /><div><span>Secure Access Control</span></div><button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}>×</button></div><div className="tenant-switcher"><span className="tenant-label">Active organization</span><button><span className="tenant-avatar">{tenant.tenant_name.slice(0, 2).toUpperCase()}</span><span><strong>{tenant.tenant_name}</strong><small>{tenant.role}</small></span><span className="chevron">⌄</span></button></div><nav className="main-nav" aria-label="Main navigation">{navigation.map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => {setActiveView(item.id); setMobileNavOpen(false);}}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'requests' && pendingCount > 0 ? <em>{pendingCount}</em> : null}</button>)}</nav><div className="sidebar-bottom"><div className="connection-status"><span className="live-dot" /><div><strong>Control plane</strong><small>Live Django API · OIDC session</small></div></div><button className="nav-secondary"><Icon name="?" /> Help & documentation</button><button className="profile-button"><span className="profile-avatar">{(auth.user?.name || 'Admin').slice(0, 2).toUpperCase()}</span><span><strong>{auth.user?.name || 'Administrator'}</strong><small>{tenant.role}</small></span><span className="chevron">⌄</span></button></div></aside><main className="main-content"><header className="topbar"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>☰</button><div><span className="breadcrumb">{tenant.tenant_name} <span>/</span> {navigation.find((item) => item.id === activeView)?.label}</span><h1>{activeView === 'overview' ? `Good morning, ${auth.user?.name?.split(' ')[0] || 'Administrator'}` : navigation.find((item) => item.id === activeView)?.label}</h1></div><div className="top-actions"><button className="round-button" aria-label="Notifications"><span className="notification-dot" />◔</button><div className="top-profile"><span className="profile-avatar">{(auth.user?.name || 'Admin').slice(0, 2).toUpperCase()}</span><span><strong>{auth.user?.name || 'Administrator'}</strong><small>{tenant.role}</small></span></div></div></header><div className="page-content"><div className="demo-banner"><span className="demo-badge">LIVE</span><span>Tenant-scoped data from Django. Approval generates the OTP and sends only a wake-up event to the authorized mobile app.</span><button onClick={() => setActiveView('audit')}>View audit status →</button></div>{error ? <div className="callout"><span className="note-icon">!</span><div><strong>Some live data could not be refreshed</strong><p>{error}</p></div></div> : null}{content}</div></main>{selectedRequest ? <RequestDrawer tenantId={tenantId} request={selectedRequest} onClose={() => setSelectedRequest(null)} onUpdated={updateRequest} /> : null}</div>;
}
