export type ViewKey = 'overview' | 'requests' | 'lockers' | 'people' | 'audit' | 'alerts';

export type RequestStatus = 'Pending review' | 'Approved' | 'Rejected' | 'Verifying' | 'Actuated';

export type UnlockRequest = {
  id: string;
  locker: string;
  site: string;
  requester: string;
  reason: string;
  status: RequestStatus;
  age: string;
  priority: 'Normal' | 'High';
};

export const requests: UnlockRequest[] = [
  {id: 'AL-2026-000184', locker: 'Vault Locker 01', site: 'Kochi Branch · Basement Vault', requester: 'Ananya Menon', reason: 'Quarterly bearer instrument audit', status: 'Pending review', age: '4 min ago', priority: 'High'},
  {id: 'AL-2026-000183', locker: 'Records Locker 07', site: 'Bengaluru HQ · Archive Floor', requester: 'Rahul Joseph', reason: 'Retrieve signed customer records', status: 'Pending review', age: '11 min ago', priority: 'Normal'},
  {id: 'AL-2026-000182', locker: 'Vault Locker 03', site: 'Kochi Branch · Basement Vault', requester: 'Meera Nair', reason: 'End-of-day reconciliation', status: 'Approved', age: '28 min ago', priority: 'Normal'},
  {id: 'AL-2026-000181', locker: 'Cash Locker 02', site: 'Mumbai Branch · Secure Room', requester: 'Vikram Shah', reason: 'Cash operations handover', status: 'Verifying', age: '36 min ago', priority: 'High'},
];

export const lockers = [
  {name: 'Vault Locker 01', site: 'Kochi Branch', status: 'Online', battery: '96%', policy: '2 of 3', lastSeen: '12 sec ago'},
  {name: 'Vault Locker 03', site: 'Kochi Branch', status: 'Online', battery: '91%', policy: '2 of 3', lastSeen: '18 sec ago'},
  {name: 'Records Locker 07', site: 'Bengaluru HQ', status: 'Degraded', battery: '64%', policy: '2 of 3', lastSeen: '3 min ago'},
  {name: 'Cash Locker 02', site: 'Mumbai Branch', status: 'Offline', battery: '—', policy: '3 of 3', lastSeen: '42 min ago'},
];

export const people = [
  {name: 'Ananya Menon', id: 'EMP-1042', role: 'Branch operations', devices: '1 active', status: 'Active'},
  {name: 'Rahul Joseph', id: 'EMP-1091', role: 'Records custodian', devices: '1 active', status: 'Active'},
  {name: 'Meera Nair', id: 'EMP-1037', role: 'Finance controller', devices: '1 pending', status: 'Pending'},
  {name: 'Vikram Shah', id: 'EMP-1188', role: 'Cash operations', devices: 'Revoked', status: 'Revoked'},
];

export const auditEvents = [
  {event: 'Unlock request submitted', actor: 'Ananya Menon', target: 'Vault Locker 01', time: '4 min ago', tone: 'blue'},
  {event: 'Device enrollment approved', actor: 'Priya Raman · Administrator', target: 'EMP-1037', time: '1 hr ago', tone: 'green'},
  {event: 'Lock heartbeat missed', actor: 'System', target: 'Cash Locker 02', time: '42 min ago', tone: 'amber'},
  {event: 'Unlock request actuated', actor: 'System', target: 'Vault Locker 03', time: '1 hr ago', tone: 'green'},
];

export const navItems: Array<{key: ViewKey; label: string; icon: string}> = [
  {key: 'overview', label: 'Overview', icon: '⌂'},
  {key: 'requests', label: 'Unlock requests', icon: '↗'},
  {key: 'lockers', label: 'Lockers & sites', icon: '▣'},
  {key: 'people', label: 'People & devices', icon: '◌'},
  {key: 'audit', label: 'Audit trail', icon: '≡'},
  {key: 'alerts', label: 'Security alerts', icon: '!'},
];
