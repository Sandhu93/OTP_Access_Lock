export type RequestStatus = 'Pending review' | 'Approved' | 'Rejected';

export type UnlockRequest = {
  id: string;
  locker: string;
  site: string;
  requester: string;
  requesterInitials: string;
  reason: string;
  requestedAt: string;
  expiresIn: string;
  status: RequestStatus;
};

export const tenant = {
  id: 'demo-bank-tenant',
  name: 'Northstar Bank',
  region: 'India South',
};

export const initialRequests: UnlockRequest[] = [
  {
    id: 'AL-2026-000184',
    locker: 'Vault Locker 01',
    site: 'Kochi Branch · Basement Vault',
    requester: 'Ananya Menon',
    requesterInitials: 'AM',
    reason: 'Retrieve sealed customer documents for the compliance review.',
    requestedAt: 'Just now',
    expiresIn: '58 min',
    status: 'Pending review',
  },
  {
    id: 'AL-2026-000183',
    locker: 'Cash Locker 07',
    site: 'Thrissur Branch · Operations',
    requester: 'Rohan Thomas',
    requesterInitials: 'RT',
    reason: 'Dual-control cash reconciliation.',
    requestedAt: '12 min ago',
    expiresIn: '47 min',
    status: 'Pending review',
  },
  {
    id: 'AL-2026-000182',
    locker: 'Vault Locker 03',
    site: 'Kochi Branch · Basement Vault',
    requester: 'Meera Shah',
    requesterInitials: 'MS',
    reason: 'Audit evidence retrieval.',
    requestedAt: 'Yesterday, 16:42',
    expiresIn: 'Closed',
    status: 'Approved',
  },
];

export const lockers = [
  {name: 'Vault Locker 01', site: 'Kochi Branch', status: 'Online', battery: '96%', policy: '2 of 3', lastSeen: '12 sec ago'},
  {name: 'Vault Locker 03', site: 'Kochi Branch', status: 'Online', battery: '88%', policy: '2 of 3', lastSeen: '28 sec ago'},
  {name: 'Cash Locker 07', site: 'Thrissur Branch', status: 'Warning', battery: '42%', policy: '3 of 3', lastSeen: '3 min ago'},
  {name: 'Records Locker 02', site: 'Alappuzha Branch', status: 'Offline', battery: '—', policy: '2 of 3', lastSeen: '2 hr ago'},
];

export const people = [
  {name: 'Ananya Menon', id: 'EMP-1048', role: 'Branch Compliance', devices: 1, status: 'Active'},
  {name: 'Rohan Thomas', id: 'EMP-0881', role: 'Vault Operations', devices: 1, status: 'Active'},
  {name: 'Meera Shah', id: 'EMP-1130', role: 'Internal Audit', devices: 2, status: 'Pending device'},
];

export const auditEvents = [
  {time: '09:41:12', actor: 'System', event: 'Unlock request created', detail: 'AL-2026-000184 · Vault Locker 01', tone: 'blue'},
  {time: '09:38:03', actor: 'Device gateway', event: 'Locker heartbeat received', detail: 'Cash Locker 07 · battery 42%', tone: 'amber'},
  {time: 'Yesterday', actor: 'Priya Nair', event: 'User device revoked', detail: 'Meera Shah · Pixel 8', tone: 'red'},
  {time: 'Yesterday', actor: 'System', event: 'Policy updated', detail: 'Vault Locker 03 · 2 of 3', tone: 'green'},
];
