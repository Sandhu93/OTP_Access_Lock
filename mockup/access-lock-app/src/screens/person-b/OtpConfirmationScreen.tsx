import React, { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Icon } from '@/components/Icon';
import { OtpInput, emptyOtp, isOtpComplete } from '@/components/OtpInput';
import { colors, fonts } from '@/theme/tokens';
import { useCountdown } from '@/hooks/useCountdown';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonBOtp'>;

const OTP_VALIDITY_SECONDS = 60;
const MAX_ATTEMPTS = 2;

/**
 * TODO(integration): call the real backend to verify the code. Never
 * log or store the raw digits beyond this request, and never surface
 * them in analytics, crash reports or screenshots.
 */
async function verifyOtp(_code: string): Promise<boolean> {
  return true;
}

type ScreenState = 'entry' | 'expired' | 'attemptsReached' | 'disconnected' | 'cancelled';

export function PersonBOtpScreen({ navigation }: Props) {
  const [otp, setOtp] = useState(emptyOtp());
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
  const [invalid, setInvalid] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [screenState, setScreenState] = useState<ScreenState>('entry');

  const { label } = useCountdown(OTP_VALIDITY_SECONDS, () => {
    if (screenState === 'entry') setScreenState('expired');
  });

  const complete = isOtpComplete(otp);

  async function handleConfirm() {
    setVerifying(true);
    const ok = await verifyOtp(otp.join(''));
    setVerifying(false);
    if (ok) {
      navigation.navigate('DualPresenceVerification', { role: 'B' });
      return;
    }
    const remaining = attemptsLeft - 1;
    setAttemptsLeft(remaining);
    setOtp(emptyOtp());
    // The second incorrect attempt aborts the flow entirely and alerts
    // the administrator — there is no third try.
    if (remaining <= 0) {
      setScreenState('attemptsReached');
    } else {
      setInvalid(true);
    }
  }

  if (screenState === 'expired') {
    return (
      <Recovery
        title="This code has expired"
        message="Codes are valid for one minute. Stay connected and a fresh code will be issued while the request is still active."
        primaryLabel="Get a new code"
        onPrimary={() => navigation.replace('PersonBOtp')}
        onCancel={() => navigation.navigate('LockerHome')}
        tone="neutral"
        icon="clock"
      />
    );
  }

  if (screenState === 'attemptsReached') {
    return (
      <Recovery
        title="Too many incorrect attempts"
        message="This request has been cancelled and the locker remains locked. The administrator has been alerted. Ask Person A to start a new request."
        primaryLabel="Back to Lockers"
        onPrimary={() => navigation.navigate('LockerHome')}
        tone="danger"
        icon="xCircle"
      />
    );
  }

  if (screenState === 'disconnected') {
    return (
      <Recovery
        title="Locker disconnected"
        message="Your connection to the locker was lost before presence could be confirmed. The locker remains locked. Move closer and reconnect."
        primaryLabel="Reconnect"
        onPrimary={() => navigation.replace('PersonBScan')}
        onCancel={() => navigation.navigate('LockerHome')}
        cancelLabel="Cancel request"
        tone="danger"
        icon="plugSlash"
      />
    );
  }

  if (screenState === 'cancelled') {
    return (
      <Recovery
        title="Request was cancelled"
        message="This access request is no longer active. The locker remains locked. Check with Person A if access is still needed."
        primaryLabel="Back to Lockers"
        onPrimary={() => navigation.navigate('LockerHome')}
        tone="neutral"
        icon="xCircle"
      />
    );
  }

  return (
    <ScreenContainer>
      <TopBar title="Confirm presence" onBack={() => navigation.navigate('PersonBScan')} eyebrow="Person B · Confirm presence" eyebrowTone="success" />
      <View style={styles.body}>
        <View style={styles.lockerHead}>
          <Text style={styles.lockerName}>Vault Locker 01</Text>
          <Text style={styles.lockerSite}>Kochi Branch — Basement Vault</Text>
        </View>

        <Text style={styles.title}>Confirm your presence</Text>
        <Text style={styles.sub}>Enter the 6-digit code delivered securely inside the app</Text>

        <View style={{ marginTop: 24 }}>
          <OtpInput value={otp} onChange={(next) => { setOtp(next); setInvalid(false); }} error={invalid} />
        </View>

        {invalid && (
          <View style={{ marginTop: 16, width: '100%' }}>
            <ErrorBanner
              tone="danger"
              text={`Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining — one more wrong entry will cancel this request.`}
            />
          </View>
        )}

        <View style={styles.timerRow}>
          <Icon name="clock" size={14} color={colors.textTertiary} strokeWidth={2} />
          <Text style={styles.timerText}>Code expires in {label}</Text>
        </View>
        <Text style={styles.attemptsText}>Up to {MAX_ATTEMPTS} attempts allowed for this code</Text>

        <View style={{ flex: 1 }} />
        <Button label="Confirm presence" disabled={!complete} loading={verifying} onPress={handleConfirm} style={{ marginBottom: 10 }} />
        <Button label="Cancel" variant="secondary" onPress={() => navigation.navigate('LockerHome')} />
      </View>
    </ScreenContainer>
  );
}

function Recovery({
  title,
  message,
  primaryLabel,
  onPrimary,
  onCancel,
  cancelLabel = 'Cancel',
  tone,
  icon
}: {
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
  tone: 'danger' | 'neutral';
  icon: 'clock' | 'xCircle' | 'plugSlash';
}) {
  const bg = tone === 'danger' ? colors.dangerSoft : colors.neutralSoft;
  const fg = tone === 'danger' ? colors.danger : colors.textSecondary;

  return (
    <ScreenContainer>
      <TopBar title="Confirm presence" eyebrow="Person B · Confirm presence" eyebrowTone="success" />
      <View style={styles.recovery}>
        <View style={{ flex: 1 }} />
        <View style={[styles.recoveryIcon, { backgroundColor: bg }]}>
          <Icon name={icon} size={32} color={fg} strokeWidth={1.6} />
        </View>
        <Text style={styles.recoveryTitle}>{title}</Text>
        <Text style={styles.recoveryMessage}>{message}</Text>
        <View style={{ flex: 1 }} />
        <Button label={primaryLabel} onPress={onPrimary} style={{ marginBottom: onCancel ? 10 : 0 }} variant={tone === 'danger' && !onCancel ? 'secondary' : 'primary'} />
        {onCancel && <Button label={cancelLabel} variant="secondary" onPress={onCancel} />}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 14, paddingBottom: 24 },
  lockerHead: { alignItems: 'center', marginBottom: 6 },
  lockerName: { fontFamily: fonts.bold, fontSize: 15, color: colors.textPrimary },
  lockerSite: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textTertiary },
  title: { fontFamily: fonts.bold, fontSize: 19, color: colors.textPrimary, marginTop: 18, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  timerText: { fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary },
  attemptsText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary, marginTop: 10 },
  recovery: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingBottom: 24 },
  recoveryIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  recoveryTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary, textAlign: 'center' },
  recoveryMessage: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 21 }
});
