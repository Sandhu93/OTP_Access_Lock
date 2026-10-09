import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {useLockBle} from './ble/useLockBle';
import {bytesToCompactHex} from './ble/lockProtocol';
import {createAccessLockApi} from './backend/accessLockApi';
import {MOBILE_API_BASE_URL, useAccessLockAuth} from './auth/accessLockAuth';
import {
  Banner,
  BottomNav,
  Button,
  Card,
  colors,
  LockedPill,
  Row,
  ScanRings,
  Screen,
  StatusChip,
  Timeline,
  TopBar,
} from './ui/DesignSystem';

const {LOCK_DEVICE_NAME, SESSION_ROLES} = require('./ble/lockProtocol');
const LOCKER_ID = 'acba64a7-bbd9-46a8-afe2-0fe155d70ad3';
const {AccessLockSecureStore} = NativeModules;

const FAILURE_COPY = {
  connectionFailed: ['Couldn’t connect to the locker', 'Move closer to the locker and try again.', 'Retry'],
  encryptionNotEstablished: ['Secure connection not established', 'No request was sent because the encrypted session could not be verified.', 'Try again'],
  lockerDisconnected: ['Locker disconnected', 'The connection was lost. Nothing was authorized.', 'Reconnect'],
  adminRejected: ['Request not approved', 'The administrator rejected this access request.', 'Back to Lockers'],
  requestExpired: ['Request expired', 'This request was closed automatically. Start again if access is still needed.', 'Start again'],
  personADisconnected: ['Requester disconnected', 'Person A’s active connection was lost during verification.', 'Retry'],
  backendUnavailable: ['Service unavailable', 'The authorization service could not be reached. The locker remains locked.', 'Try again'],
  requestNotApproved: ['Waiting for approval', 'The administrator has not approved this request yet. The locker remains locked.', 'Back to Lockers'],
  otpLockedOut: ['OTP locked out', 'Too many incorrect codes were entered. The administrator has been alerted.', 'Back to Lockers'],
  authorizationDenied: ['Authorization denied', 'The backend did not issue authorization for this request.', 'Back to Lockers'],
  lockerResetCancelled: ['Request cancelled', 'This access request is no longer active.', 'Back to Lockers'],
};

function isLiveApprovedRequest(request) {
  return request.status === 'approved_waiting_second_party' && (!request.expires_at || new Date(request.expires_at).getTime() > Date.now());
}

function otpFailureType(error) {
  if (error?.errorCode === 'challenge_expired' || error?.errorCode === 'request_not_approved') return error.errorCode === 'challenge_expired' ? 'requestExpired' : 'requestNotApproved';
  if (error?.errorCode === 'otp_locked_out') return 'otpLockedOut';
  if (error?.errorCode === 'otp_invalid') return 'authorizationDenied';
  return error?.status === 400 ? 'authorizationDenied' : 'backendUnavailable';
}

function sessionId(seed) {
  // SECURITY-PLACEHOLDER: locally generated session IDs are bench-only. Production
  // sessions must be issued and authenticated by the backend before actuation.
  return [
    seed & 0xff,
    (seed >> 8) & 0xff,
    (seed >> 16) & 0xff,
    (seed >> 24) & 0xff,
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ];
}

function PageTitle({title, subtitle, eyebrow, tone = 'accent'}) {
  return (
    <View style={styles.pageTitle}>
      {eyebrow ? <Text style={[styles.eyebrowText, tone === 'success' && styles.successText, tone === 'amber' && styles.amberText]}>{eyebrow.toUpperCase()}</Text> : null}
      <Text style={styles.pageHeading}>{title}</Text>
      {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function BrandLogo({compact = false}) {
  return <Image accessibilityLabel="Muthoot Finance" source={require('./assets/muthoot-finance-logo.png')} resizeMode="contain" style={compact ? styles.brandLogoCompact : styles.brandLogo} />;
}

function LoginScreen({auth}) {
  const [tenantSlug, setTenantSlug] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await auth.signIn({tenantSlug: tenantSlug.trim(), employeeId: employeeId.trim(), password}); }
    catch (_) { /* The auth hook exposes a user-safe error message. */ }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <View style={styles.loginHero}>
        <BrandLogo />
        <Text style={styles.eyebrowText}>SECURE ACCESS CONTROL</Text>
        <Text style={styles.pageHeading}>Sign in to continue</Text>
        <Text style={styles.pageSubtitle}>Use your enrolled identity. The lock remains closed until the backend verifies both people.</Text>
      </View>
      <Card>
        <Text style={styles.sectionHeading}>{auth.authMode === 'password_demo' ? 'Temporary demo sign-in' : 'Organization sign-in'}</Text>
        <Text style={styles.body}>{auth.authMode === 'password_demo' ? 'Use the organization code and employee credentials assigned for this test. Your short-lived access token is stored in Android Keystore.' : 'Sign in with your organization identity provider. The lock remains closed unless the backend verifies both enrolled people.'}</Text>
        {auth.error ? <Banner tone="danger" text={auth.error} /> : null}
      </Card>
      {auth.authMode === 'password_demo' ? (
        <Card style={styles.signInCard}>
          <TextInput value={tenantSlug} onChangeText={setTenantSlug} autoCapitalize="none" autoCorrect={false} placeholder="Organization code" placeholderTextColor={colors.textTertiary} style={styles.signInInput} accessibilityLabel="Organization code" />
          <TextInput value={employeeId} onChangeText={setEmployeeId} autoCapitalize="characters" autoCorrect={false} placeholder="Employee ID" placeholderTextColor={colors.textTertiary} style={styles.signInInput} accessibilityLabel="Employee ID" />
          <TextInput value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Password" placeholderTextColor={colors.textTertiary} style={styles.signInInput} accessibilityLabel="Password" />
          <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={submit} loading={busy} disabled={busy || !tenantSlug || !employeeId || !password} style={styles.pageButton} />
          <Text style={styles.demoAuthWarning}>Password-only temporary demo mode. Not for production use.</Text>
        </Card>
      ) : auth.authMode === 'oidc' ? (
        <Button label="Sign in with Muthoot Finance" onPress={() => auth.signIn().catch(() => {})} style={styles.pageButton} />
      ) : null}
      <Text style={styles.devNote}>Local demo endpoint: {MOBILE_API_BASE_URL}</Text>
    </Screen>
  );
}

function DeviceCard({device, onConnect, connecting}) {
  return (
    <Card style={styles.deviceCard}>
      <View style={{flex: 1}}>
        <Text style={styles.cardTitle}>{device?.name || LOCK_DEVICE_NAME}</Text>
        <Text style={styles.muted}>{device?.id || 'Nearby enrolled locker'}</Text>
        <View style={styles.chipLine}><StatusChip label="Found nearby" tone="success" icon="✓" /><StatusChip label="Locked" tone="neutral" icon="⌑" /></View>
      </View>
      <Button label={connecting ? 'Connecting…' : 'Connect'} onPress={() => onConnect(device)} loading={connecting} style={styles.smallButton} />
    </Card>
  );
}

function HomeScreen({onNavigate, onStartA, onStartB}) {
  return (
    <View style={styles.flex}>
      <Screen>
        <View style={styles.homeHeader}>
          <BrandLogo compact />
          <Text style={styles.eyebrowText}>SECURE ACCESS CONTROL</Text>
          <Text style={styles.pageHeading}>My lockers</Text>
          <Text style={styles.pageSubtitle}>Secure access requires two enrolled people.</Text>
        </View>
        <Card>
          <View style={styles.cardTopLine}><View><Text style={styles.cardTitle}>Vault Locker 01</Text><Text style={styles.muted}>Kochi Branch · Basement Vault</Text></View><StatusChip label="Locked" tone="neutral" icon="⌑" /></View>
          <View style={styles.divider} />
          <Row label="Status" value="Ready" tone="success" />
          <Row label="Policy" value="2 of 3 enrolled users" />
          <Row label="Last seen" value="Just now" />
          <Button label="Start access request" onPress={onStartA} style={styles.topButton} />
          <Button label="Join an approved request" onPress={onStartB} variant="secondary" />
        </Card>
        <Banner tone="accent" text="The locker opens only after administrator approval, a second enrolled person, and backend authorization are all confirmed." />
        <Card>
          <Text style={styles.sectionHeading}>Active request</Text>
          <Text style={styles.body}>No active access request on this phone.</Text>
          <Text style={styles.muted}>Requests and outcomes appear in Activity.</Text>
        </Card>
      </Screen>
      <BottomNav active="lockers" onNavigate={onNavigate} />
    </View>
  );
}

function ScanScreen({role, ble, onBack, onFound, onFailure}) {
  useEffect(() => {
    ble.startScan();
  }, []);

  const label = role === 'A' ? 'Person A · Request access' : 'Person B · Confirm presence';
  return (
    <Screen>
      <TopBar title="Scan for locker" onBack={onBack} eyebrow={label} />
      <View style={styles.scanHero}><ScanRings /><Text style={styles.pageHeading}>{ble.isScanning ? 'Searching for your assigned locker' : 'Scan for your assigned locker'}</Text><Text style={styles.pageSubtitle}>Only lockers enrolled to you should appear.</Text></View>
      <Card>
        <Row label="Bluetooth" value={ble.bleState === 'PoweredOn' ? 'On' : 'Turned off'} tone={ble.bleState === 'PoweredOn' ? 'success' : 'amber'} />
        <Row label="Nearby devices permission" value={ble.permissionGranted ? 'Granted' : 'Needed'} tone={ble.permissionGranted ? 'success' : 'amber'} />
      </Card>
      {ble.devices.length ? ble.devices.map(device => <DeviceCard key={device.id} device={device} onConnect={deviceToConnect => onFound(deviceToConnect)} connecting={ble.isBusy} />) : (
        <View style={styles.emptyState}><Text style={styles.emptyTitle}>{ble.isScanning ? 'Looking for LOCK-TEST-01…' : 'No locker found nearby'}</Text><Text style={styles.body}>Move closer to the locker and make sure Bluetooth is on.</Text></View>
      )}
      {ble.lastError ? <Banner tone="danger" text={ble.lastError} /> : null}
      <Button label={ble.isScanning ? 'Scanning…' : 'Scan again'} onPress={ble.startScan} disabled={ble.isScanning || ble.isBusy} style={styles.pageButton} />
      <Button label="Cancel" onPress={onBack} variant="ghost" />
    </Screen>
  );
}

function LockerFoundScreen({ble, device, onBack, onConnected, onFailure}) {
  const connect = async () => {
    const ok = await ble.connect(device);
    if (ok) onConnected();
    else onFailure('connectionFailed');
  };
  return (
    <Screen>
      <TopBar title="Locker found" onBack={onBack} eyebrow="Person A · Request access" />
      <View style={styles.scanHero}><ScanRings color={colors.success} icon="⌑" found /><Text style={styles.pageHeading}>{device?.name || LOCK_DEVICE_NAME}</Text><Text style={styles.pageSubtitle}>Kochi Branch · Basement Vault</Text></View>
      <Card><View style={styles.chipLine}><StatusChip label="Locked" tone="neutral" icon="⌑" /><StatusChip label="Enrolled" tone="success" icon="✓" /></View><Text style={styles.body}>Connection is encrypted before any request is sent. Being nearby does not unlock the locker.</Text></Card>
      <Button label="Connect to locker" onPress={connect} loading={ble.isBusy} style={styles.pageButton} />
      <Button label="Scan again" onPress={onBack} variant="secondary" />
    </Screen>
  );
}

function ConnectedScreen({ble, role, sessionIdValue, onBack, onRequest, onFailure}) {
  useEffect(() => {
    if (!ble.connected) onFailure('lockerDisconnected');
  }, [ble.connected]);
  const openSession = () => ble.actions.openSession(role === 'A' ? SESSION_ROLES.requester : SESSION_ROLES.approver, sessionIdValue);
  return (
    <Screen>
      <TopBar title="Locker connected" onBack={onBack} centered eyebrow={role === 'A' ? 'Person A · Request access' : 'Person B · Confirm presence'} />
      <View style={styles.connectionHero}><ScanRings color={ble.sessionOpen ? colors.success : colors.accent} icon="⌑" found /><Text style={styles.pageHeading}>{ble.sessionOpen ? 'Secure session established' : 'Locker connected'}</Text><Text style={styles.pageSubtitle}>Vault Locker 01 · Kochi Branch</Text></View>
      <Card>
        <Row label="BLE connection" value={ble.connected ? 'Connected' : 'Disconnected'} tone={ble.connected ? 'success' : 'amber'} />
        <Row label="Session" value={ble.sessionOpen ? 'Authenticated bench session' : 'Not opened'} tone={ble.sessionOpen ? 'success' : 'amber'} />
        <Row label="Locker" value="Locked" />
      </Card>
      <Banner tone="accent" text="2 of 3 approvals are required. A second enrolled person and an administrator must confirm before this locker opens." />
      {!ble.sessionOpen ? <Button label="Open secure BLE session" onPress={openSession} loading={ble.isBusy} style={styles.pageButton} /> : <Button label={role === 'A' ? 'Continue to request access' : 'Find approved request'} onPress={onRequest} style={styles.pageButton} />}
      <Button label="Disconnect" onPress={ble.disconnect} variant="secondary" disabled={ble.isBusy} />
    </Screen>
  );
}

function AccessRequestScreen({ble, onBack, onSubmit}) {
  const [reason, setReason] = useState('Secure document retrieval');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const reasons = ['Secure document retrieval', 'Cash or instrument handling', 'Other controlled access'];
  return (
    <Screen>
      <TopBar title="Access request" onBack={onBack} eyebrow="Person A · Request access" />
      <PageTitle title="Why do you need access?" subtitle="The administrator will review this reason before the second person is invited." />
      <Card>{reasons.map(option => <Pressable key={option} onPress={() => setReason(option)} style={[styles.option, reason === option && styles.selectedOption]}><View style={[styles.radio, reason === option && styles.selectedRadio]} /><Text style={styles.optionText}>{option}</Text></Pressable>)}</Card>
      <Banner tone="amber" text="The locker stays locked during review. Do not leave the locker unattended while a request is active." />
      {error ? <Banner tone="danger" text={error} /> : null}
      <Button label={submitting ? 'Submitting…' : 'Submit access request'} onPress={async () => {setSubmitting(true); setError(''); try {await onSubmit(reason);} catch (nextError) {setError(nextError.message);} finally {setSubmitting(false);}}} style={styles.pageButton} disabled={!ble.sessionOpen || submitting} loading={submitting} />
      {!ble.sessionOpen ? <Text style={styles.centerNote}>Open the secure requester session first.</Text> : null}
    </Screen>
  );
}

function WaitingReviewScreen({ble, request, api, onCancel, onApproved, onSuccess, onFailure}) {
  useEffect(() => {
    if (!request?.id) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const next = await api.getUnlockRequest(request.id);
        if (!active) return;
        if (next.status === 'approved_waiting_second_party') onApproved(next);
        if (next.status === 'token_issued') onSuccess(next);
        if (['rejected', 'expired', 'aborted', 'otp_locked_out'].includes(next.status)) onFailure(next.status === 'rejected' ? 'adminRejected' : 'requestExpired');
      } catch (error) {
        if (active) onFailure('backendUnavailable');
      }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {active = false; clearInterval(timer);};
  }, [api, request?.id, onApproved, onFailure, onSuccess]);
  return (
    <Screen>
      <TopBar title="Access request" centered eyebrow="Waiting for security review" tone="amber" />
      <PageTitle title="Request submitted" subtitle="The administrator must approve this request before a second person can confirm presence." tone="amber" />
      <Card><View style={styles.requestHeader}><Text style={styles.muted}>REQUEST</Text><Text style={styles.requestId}>{request?.id || 'Pending'}</Text><Text style={styles.muted}>Local Test Locker · Mumbai Operations</Text></View><Timeline items={[{label: 'Request submitted', status: 'Complete', done: true}, {label: 'Administrator review', status: 'Waiting', done: false}, {label: 'Second person confirmation', status: 'Not started', done: false}, {label: 'Final authorization', status: 'Not started', done: false}]} /></Card>
      <LockedPill />
      <Banner tone="success" text="The locker remains locked until all required checks are complete." />
      <Button label="Cancel request" onPress={onCancel} variant="secondary" disabled={!ble.sessionOpen} />
      <Text style={styles.devNote}>Waiting for the live dashboard decision. This phone does not approve its own request.</Text>
    </Screen>
  );
}

function ApprovedWaitingScreen({ble, request, api, onCancel, onSuccess, onFailure}) {
  useEffect(() => {
    if (!request?.id) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const next = await api.getUnlockRequest(request.id);
        if (!active) return;
        if (next.status === 'token_issued') onSuccess(next);
        if (['rejected', 'expired', 'aborted', 'otp_locked_out'].includes(next.status)) onFailure(next.status === 'rejected' ? 'adminRejected' : 'requestExpired');
      } catch (error) { if (active) onFailure('backendUnavailable'); }
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => {active = false; clearInterval(timer);};
  }, [api, request?.id, onFailure, onSuccess]);
  return (
    <Screen>
      <TopBar title="Active request" centered eyebrow="Request approved" tone="success" />
      <PageTitle title="Waiting for the second person" subtitle="An eligible enrolled person must connect to the same locker and confirm their presence." tone="success" />
      <Card><Text style={styles.cardTitle}>Vault Locker 01</Text><Text style={styles.muted}>Kochi Branch · Basement Vault</Text><View style={styles.divider} /><Row label="Your connection" value={ble.connected ? 'Connected' : 'Disconnected'} tone={ble.connected ? 'success' : 'amber'} /><Row label="Second person" value="Not yet connected" tone="amber" /><Row label="Request window" value="01:00 remaining" tone="amber" /></Card>
      <Banner tone="accent" text="Keep this phone connected and remain with the locker until the second person arrives." />
      <Button label="Cancel request" onPress={onCancel} variant="secondary" />
      <Text style={styles.devNote}>The second person must connect and verify the OTP. This phone only observes backend status.</Text>
    </Screen>
  );
}

function ApprovedRequestsScreen({api, ble, sessionIdValue, onBack, onSelect, onFailure}) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const all = await api.listUnlockRequests();
        if (active) {setRequests(all.filter(isLiveApprovedRequest)); setError(''); setLoading(false);}
      } catch (nextError) {if (active) {setError(nextError.message); setLoading(false); onFailure('backendUnavailable');}}
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {active = false; clearInterval(timer);};
  }, [api, onFailure]);
  const join = async request => {
    try {
      const presence = await api.createPresenceSession({request_id: request.id, locker_id: request.locker, ble_session_id: bytesToCompactHex(sessionIdValue)});
      onSelect(request, presence);
    } catch (nextError) {setError(nextError.message);}
  };
  return <Screen><TopBar title="Approved requests" onBack={onBack} eyebrow="Person B · Confirm presence" tone="success" /><PageTitle title="Choose a live request" subtitle="Only requests assigned to your enrolled identity appear here." />{error ? <Banner tone="danger" text={error} /> : null}{loading ? <ActivityIndicator size="large" color={colors.accent} /> : requests.length ? requests.map(request => <Card key={request.id}><Text style={styles.cardTitle}>{request.locker_name}</Text><Text style={styles.muted}>{request.site_name}</Text><Text style={styles.body}>{request.requester_name} · {request.reason}</Text><Button label="Confirm presence" onPress={() => join(request)} style={styles.pageButton} /></Card>) : <View style={styles.emptyState}><Text style={styles.emptyTitle}>No approved request yet</Text><Text style={styles.body}>Keep this phone connected. The list refreshes automatically after the administrator approves Person A’s request.</Text></View>}</Screen>;
}

function OtpScreen({ble, api, request, onBack, onSuccess, onFailure}) {
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const current = await api.getUnlockRequest(request.id);
        if (!isLiveApprovedRequest(current) || !current.otp_challenge_id) {
          if (active) onFailure(current.status === 'expired' ? 'requestExpired' : 'requestNotApproved');
          return;
        }
        const next = await api.getOtpChallenge(current.otp_challenge_id);
        if (next.request_id !== request.id) {
          if (active) onFailure('requestNotApproved');
          return;
        }
        if (new Date(next.expires_at).getTime() <= Date.now()) {
          if (active) onFailure('requestExpired');
          return;
        }
        if (active) {setChallenge(next); setOtp(next.otp);}
      } catch (error) { if (active) onFailure(otpFailureType(error)); }
    };
    load();
    return () => {active = false;};
  }, [api, request?.id, onFailure]);
  const confirm = () => {
    setSubmitted(true);
    api.verifyOtpChallenge(challenge.challenge_id, otp)
      .then(result => {
        if (result.verified) onSuccess(result.request);
        else onFailure(otpFailureType({errorCode: result.error_code, status: 400}));
      })
      .catch(error => {setSubmitted(false); onFailure(otpFailureType(error));});
  };
  return (
    <Screen>
      <TopBar title="Confirm presence" onBack={onBack} eyebrow="Person B · Confirm presence" tone="success" />
      <View style={styles.otpHeader}><Text style={styles.cardTitle}>Vault Locker 01</Text><Text style={styles.muted}>Kochi Branch · Basement Vault</Text></View>
      <Card>
        <Text style={styles.sectionHeading}>Enter the one-time code</Text>
        <Text style={styles.body}>Use the code delivered securely inside the app. It is single-use and expires quickly.</Text>
        <TextInput value={otp} onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={colors.textTertiary} style={styles.otpInput} accessibilityLabel="Six digit one-time code" />
        <Row label="Code validity" value={challenge?.expires_at ? new Date(challenge.expires_at).toLocaleTimeString() : 'Loading…'} tone="amber" />
        <Row label="Attempts" value={`${challenge?.attempts_remaining ?? 2} remaining`} tone="amber" />
      </Card>
      <Banner tone="amber" text="Two incorrect attempts abort the request and alert the administrator." />
      <Button label={submitted ? 'Verifying…' : 'Confirm presence'} onPress={confirm} disabled={otp.length !== 6 || submitted || !challenge} loading={submitted} style={styles.pageButton} />
      <Text style={styles.devNote}>The OTP was fetched through this authenticated device session. It is never sent to or displayed by the dashboard.</Text>
    </Screen>
  );
}

function VerificationScreen({api, request, onSuccess, onFailure}) {
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const next = await api.getUnlockRequest(request.id);
        if (!active) return;
        if (next.status === 'token_issued') onSuccess(next);
        if (['rejected', 'expired', 'aborted', 'otp_locked_out'].includes(next.status)) onFailure(next.status === 'rejected' ? 'adminRejected' : 'requestExpired');
      } catch (error) {if (active) onFailure('backendUnavailable');}
    };
    poll();
    const timer = setInterval(poll, 1500);
    return () => {active = false; clearInterval(timer);};
  }, [api, request?.id, onFailure, onSuccess]);
  return <Screen><TopBar title="Verifying access" centered eyebrow="Final authorization" tone="amber" /><View style={styles.verificationHero}><ActivityIndicator size="large" color={colors.accent} /><Text style={styles.pageHeading}>Verifying both people</Text><Text style={styles.pageSubtitle}>The authorization service is checking both active sessions before issuing a signed token.</Text></View><Card><Row label="Person A" value="Connected" tone="success" /><Row label="Person B" value="Connected" tone="success" /><Row label="Locker" value="Still locked" /></Card><Banner tone="accent" text="Bluetooth presence is only supporting evidence. The backend must authorize the action." /></Screen>;
}

function SuccessScreen({request, onFinish}) {
  return <Screen><TopBar title="Access authorized" centered eyebrow="Authorization complete" tone="success" /><View style={styles.successHero}><Text style={styles.successMark}>✓</Text><Text style={styles.pageHeading}>Signed grant delivered</Text><Text style={styles.pageSubtitle}>Both required people were confirmed by the backend.</Text></View><Card><Row label="Locker" value="Grant sent to ESP32" tone="success" /><Row label="Authorization" value="Backend-signed ES256 grant" /><Row label="Reference" value={request?.id || 'Unavailable'} /></Card><Banner tone="success" text="The ESP32 validates the grant before activating its LED actuator. The lock remains closed if validation fails." /><Button label="Finish" onPress={onFinish} style={styles.pageButton} /></Screen>;
}

function FailureScreen({type, onPrimary, onBack}) {
  const copy = FAILURE_COPY[type] || FAILURE_COPY.connectionFailed;
  return <Screen><TopBar title="Access not completed" centered eyebrow="Fail-closed result" tone="amber" /><View style={styles.failureHero}><Text style={styles.failureMark}>×</Text><Text style={styles.pageHeading}>{copy[0]}</Text><Text style={styles.pageSubtitle}>{copy[1]}</Text></View><LockedPill /><Button label={copy[2]} onPress={onPrimary} style={styles.pageButton} /><Button label="Back to Lockers" onPress={onBack} variant="secondary" /></Screen>;
}

function ActivityScreen({onNavigate}) {
  const entries = [
    ['Vault Locker 01', 'Completed · 24 Sep 2026, 15:42', 'Person A · Person B confirmed', 'success'],
    ['Vault Locker 03', 'Completed · 22 Sep 2026, 10:05', 'You confirmed as second person', 'success'],
    ['Vault Locker 01', 'Rejected · 19 Sep 2026, 17:20', 'Administrator rejected request', 'danger'],
    ['Vault Locker 02', 'Expired · 15 Sep 2026, 09:48', 'Second person never connected', 'amber'],
  ];
  return <View style={styles.flex}><Screen><TopBar title="Activity" centered eyebrow="Your access history" /><PageTitle title="Recent requests" subtitle="Read-only history from the authorization system." />{entries.map(([locker, when, detail, tone]) => <Card key={`${locker}-${when}`}><View style={styles.cardTopLine}><Text style={styles.cardTitle}>{locker}</Text><StatusChip label={tone === 'success' ? 'Completed' : tone === 'danger' ? 'Rejected' : 'Expired'} tone={tone} icon={tone === 'success' ? '✓' : tone === 'danger' ? '×' : '!'} /></View><Text style={styles.muted}>{when}</Text><Text style={styles.body}>{detail}</Text></Card>)}</Screen><BottomNav active="activity" onNavigate={onNavigate} /></View>;
}

function HelpScreen({onNavigate}) {
  return <View style={styles.flex}><Screen><TopBar title="Help" centered eyebrow="Troubleshooting" /><PageTitle title="Stay safe while connecting" subtitle="Muthoot Finance Secure Access fails closed whenever a required check cannot be completed." /><Card><Text style={styles.sectionHeading}>Bluetooth connection</Text><Text style={styles.body}>Keep Bluetooth enabled, allow nearby-device permission, and remain near the assigned locker.</Text></Card><Card><Text style={styles.sectionHeading}>Two-person access</Text><Text style={styles.body}>Person A must keep an active connection while Person B confirms presence. Connection order does not determine identity.</Text></Card><Card><Text style={styles.sectionHeading}>If access fails</Text><Text style={styles.body}>The locker remains locked. Retry the connection or contact the administrator. Do not rely on signal strength as proof of authorization.</Text></Card></Screen><BottomNav active="help" onNavigate={onNavigate} /></View>;
}

function App() {
  const auth = useAccessLockAuth();
  const ble = useLockBle();
  const [deviceId, setDeviceId] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const api = useMemo(() => createAccessLockApi({baseUrl: MOBILE_API_BASE_URL, getAccessToken: auth.getAccessToken, getDeviceId: async () => deviceId}), [auth.getAccessToken, deviceId]);
  const [stack, setStack] = useState([{name: 'LockerHome'}]);
  const [foundDevice, setFoundDevice] = useState(null);
  const [backendPresence, setBackendPresence] = useState(null);
  const ids = useMemo(() => ({requester: sessionId(Date.now()), approver: sessionId(Date.now() + 17)}), []);
  const current = stack[stack.length - 1];

  // The lock receives BLE heartbeats locally, but the backend must also know
  // that both participants remain present before it issues a signed grant.
  // Keep the authenticated backend presence session alive for the whole active
  // request flow.  If these heartbeats stop, the backend fails closed.
  useEffect(() => {
    if (!backendPresence || !auth.isSignedIn) return undefined;
    let active = true;
    const heartbeat = async () => {
      try {
        await api.heartbeatPresence(backendPresence.sessionId, {ble_session_id: backendPresence.bleSessionId});
      } catch (error) {
        // Do not authorize locally when the backend heartbeat fails. The next
        // grant attempt will be denied by the server's freshness check.
      }
    };
    heartbeat();
    const timer = setInterval(() => {
      if (active) heartbeat();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, auth.isSignedIn, backendPresence]);

  const endBackendPresence = async () => {
    const activePresence = backendPresence;
    setBackendPresence(null);
    if (activePresence) {
      try {
        await api.endPresenceSession(activePresence.sessionId);
      } catch (error) {
        // The session will become stale and fail closed even if cleanup cannot
        // reach the API.
      }
    }
  };

  useEffect(() => {
    if (!auth.isSignedIn) {setDeviceId(''); return undefined;}
    let active = true;
    (async () => {
      try {
        const fingerprint = await AccessLockSecureStore.getOrCreateDeviceFingerprint();
        const result = await createAccessLockApi({baseUrl: MOBILE_API_BASE_URL, getAccessToken: auth.getAccessToken}).registerDevice({platform: 'android', public_key_fingerprint: fingerprint});
        if (active) {setDeviceId(result.device_id); setDeviceError('');}
      } catch (error) {if (active) setDeviceError(error.message);}
    })();
    return () => {active = false;};
  }, [auth.getAccessToken, auth.isSignedIn]);

  if (auth.loading) return <Screen><ActivityIndicator size="large" color={colors.accent} /></Screen>;
  if (!auth.isSignedIn) return <LoginScreen auth={auth} />;
  if (!deviceId) return <Screen><TopBar title="Preparing secure device" centered eyebrow="Device enrollment" /><ActivityIndicator size="large" color={colors.accent} /><Text style={styles.centerNote}>{deviceError || 'Registering this phone with the local authorization service…'}</Text><Button label="Sign out" onPress={auth.signOut} variant="secondary" /></Screen>;

  const navigate = (name, params = {}) => setStack(previous => [...previous, {name, ...params}]);
  const replace = (name, params = {}) => setStack(previous => [...previous.slice(0, -1), {name, ...params}]);
  const back = () => setStack(previous => previous.length > 1 ? previous.slice(0, -1) : previous);
  const home = () => setStack([{name: 'LockerHome'}]);

  const handleTab = tab => {
    if (tab === 'lockers') home();
    else if (tab === 'activity') setStack([{name: 'Activity'}]);
    else if (tab === 'help') setStack([{name: 'Help'}]);
    else setStack([{name: 'PersonAApprovedWaitingB'}]);
  };

  switch (current.name) {
    case 'PersonAScan':
      return <ScanScreen role="A" ble={ble} onBack={back} onFound={device => {setFoundDevice(device); navigate('PersonALockerFound');}} />;
    case 'PersonALockerFound':
      return <LockerFoundScreen ble={ble} device={foundDevice} onBack={back} onConnected={() => navigate('PersonAConnected')} onFailure={type => navigate('FailureState', {type})} />;
    case 'PersonAConnected':
      return <ConnectedScreen role="A" ble={ble} sessionIdValue={ids.requester} onBack={back} onRequest={() => navigate('PersonAAccessRequest')} onFailure={type => replace('FailureState', {type})} />;
    case 'PersonAAccessRequest':
      return <AccessRequestScreen ble={ble} onBack={back} onSubmit={async reason => {const request = await api.createUnlockRequest({locker_id: LOCKER_ID, reason, ble_session_id: bytesToCompactHex(ids.requester)}); setBackendPresence({sessionId: request.presence_session_id, bleSessionId: bytesToCompactHex(ids.requester)}); navigate('PersonAWaitingReview', {request});}} />;
    case 'PersonAWaitingReview':
      return <WaitingReviewScreen ble={ble} api={api} request={current.request} onCancel={async () => {await endBackendPresence(); ble.disconnect(); home();}} onApproved={request => replace('PersonAApprovedWaitingB', {request})} onSuccess={request => replace('AuthorizationSuccess', {request})} onFailure={type => replace('FailureState', {type})} />;
    case 'PersonAApprovedWaitingB':
      return <ApprovedWaitingScreen ble={ble} api={api} request={current.request} onCancel={() => home()} onSuccess={request => replace('AuthorizationSuccess', {request})} onFailure={type => replace('FailureState', {type})} />;
    case 'PersonBScan':
      return <ScanScreen role="B" ble={ble} onBack={home} onFound={async device => {setFoundDevice(device); const ok = await ble.connect(device); if (ok) navigate('PersonBConnected'); else navigate('FailureState', {type: 'connectionFailed'});}} />;
    case 'PersonBConnected':
      return <ConnectedScreen role="B" ble={ble} sessionIdValue={ids.approver} onBack={home} onRequest={() => navigate('PersonBRequests')} onFailure={type => replace('FailureState', {type})} />;
    case 'PersonBRequests':
      return <ApprovedRequestsScreen api={api} ble={ble} sessionIdValue={ids.approver} onBack={back} onSelect={(request, presence) => {setBackendPresence({sessionId: presence.session_id, bleSessionId: bytesToCompactHex(ids.approver)}); navigate('PersonBOtp', {request, presence});}} onFailure={type => replace('FailureState', {type})} />;
    case 'PersonBOtp':
      return <OtpScreen ble={ble} api={api} request={current.request} onBack={back} onSuccess={request => navigate('DualPresenceVerification', {request})} onFailure={type => navigate('FailureState', {type})} />;
    case 'DualPresenceVerification':
      return <VerificationScreen api={api} request={current.request} onSuccess={request => replace('AuthorizationSuccess', {request})} onFailure={type => replace('FailureState', {type})} />;
    case 'AuthorizationSuccess':
      return <SuccessScreen request={current.request} onFinish={async () => {await endBackendPresence(); home();}} />;
    case 'FailureState':
      return <FailureScreen type={current.type} onPrimary={() => replace(current.type === 'personADisconnected' ? 'PersonAScan' : 'PersonAScan')} onBack={home} />;
    case 'Activity':
      return <ActivityScreen onNavigate={handleTab} />;
    case 'Help':
      return <HelpScreen onNavigate={handleTab} />;
    case 'LockerHome':
    default:
      return <HomeScreen onNavigate={handleTab} onStartA={() => navigate('PersonAScan')} onStartB={() => navigate('PersonBScan')} />;
  }
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  homeHeader: {paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16},
  loginHero: {alignItems: 'center', paddingHorizontal: 24, paddingTop: 42, paddingBottom: 24},
  signInCard: {gap: 11},
  signInInput: {minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, paddingHorizontal: 13, color: colors.textPrimary, backgroundColor: colors.surface},
  demoAuthWarning: {fontSize: 11, lineHeight: 16, color: colors.amberText, textAlign: 'center', marginTop: 1},
  brandLogo: {width: 230, height: 66, marginBottom: 18},
  brandLogoCompact: {width: 184, height: 48, marginBottom: 12},
  pageTitle: {paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16},
  pageHeading: {fontSize: 24, lineHeight: 30, fontWeight: '800', color: colors.textPrimary},
  pageSubtitle: {fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 6},
  eyebrowText: {fontSize: 11, fontWeight: '800', color: colors.accent600, letterSpacing: 0.7, marginBottom: 6},
  successText: {color: colors.success},
  amberText: {color: colors.amberText},
  cardTopLine: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12},
  cardTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary},
  sectionHeading: {fontSize: 17, fontWeight: '800', color: colors.textPrimary, marginBottom: 8},
  body: {fontSize: 14, lineHeight: 21, color: colors.textSecondary},
  muted: {fontSize: 12.5, lineHeight: 18, color: colors.textTertiary, marginTop: 3},
  divider: {height: 1, backgroundColor: colors.border, marginVertical: 12},
  chipLine: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12},
  topButton: {marginTop: 16, marginBottom: 10},
  pageButton: {marginHorizontal: 20, marginBottom: 10},
  smallButton: {width: 104, marginLeft: 12},
  deviceCard: {flexDirection: 'row', alignItems: 'center'},
  scanHero: {alignItems: 'center', paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24},
  connectionHero: {alignItems: 'center', paddingTop: 18, paddingBottom: 10},
  emptyState: {alignItems: 'center', paddingHorizontal: 32, paddingVertical: 20},
  emptyTitle: {fontSize: 16, fontWeight: '800', color: colors.textPrimary, textAlign: 'center'},
  centerNote: {fontSize: 12, color: colors.textTertiary, textAlign: 'center', marginHorizontal: 20, marginBottom: 12},
  requestHeader: {alignItems: 'center', marginBottom: 20},
  requestId: {fontSize: 18, fontWeight: '800', letterSpacing: 0.5, color: colors.textPrimary, marginVertical: 4},
  devNote: {fontSize: 11, lineHeight: 16, color: colors.textTertiary, textAlign: 'center', marginHorizontal: 24, marginTop: 6, marginBottom: 12},
  option: {minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12},
  selectedOption: {backgroundColor: colors.accentSoft, borderRadius: 10, paddingHorizontal: 10, borderBottomColor: colors.accentSoft},
  radio: {width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderStrong},
  selectedRadio: {borderWidth: 5, borderColor: colors.accent},
  optionText: {flex: 1, fontSize: 14, color: colors.textPrimary},
  otpHeader: {alignItems: 'center', paddingTop: 28, paddingBottom: 16},
  otpInput: {height: 64, borderWidth: 1.5, borderColor: colors.borderStrong, borderRadius: 14, marginTop: 18, marginBottom: 12, paddingHorizontal: 18, textAlign: 'center', fontSize: 28, letterSpacing: 8, fontWeight: '800', color: colors.textPrimary},
  verificationHero: {alignItems: 'center', paddingHorizontal: 28, paddingTop: 60, paddingBottom: 32, gap: 16},
  successHero: {alignItems: 'center', paddingHorizontal: 24, paddingTop: 34, paddingBottom: 24},
  successMark: {width: 80, height: 80, borderRadius: 40, backgroundColor: colors.successSoft, color: colors.success, textAlign: 'center', textAlignVertical: 'center', fontSize: 48, fontWeight: '800', marginBottom: 20},
  failureHero: {alignItems: 'center', paddingHorizontal: 28, paddingTop: 58, paddingBottom: 24},
  failureMark: {width: 72, height: 72, borderRadius: 36, backgroundColor: colors.dangerSoft, color: colors.dangerText, textAlign: 'center', textAlignVertical: 'center', fontSize: 44, fontWeight: '700', marginBottom: 20},
});

export default App;
