import React, { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { ScanRings } from '@/components/ScanRings';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';
import { useStopwatch } from '@/hooks/useCountdown';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonAScan'>;

type ScanMode = 'scanning' | 'empty' | 'bluetoothOff' | 'permissionDenied';

const SCAN_TIMEOUT_SECONDS = 20;
const DEMO_FOUND_AFTER_SECONDS = 3;

/**
 * TODO(integration): replace these stubs with the real platform checks
 * (e.g. react-native-ble-plx `state()` for Bluetooth, and the OS
 * nearby-devices / location permission prompt) before shipping.
 */
async function checkBluetoothEnabled(): Promise<boolean> {
  return true;
}
async function checkNearbyDevicesPermission(): Promise<boolean> {
  return true;
}

export function PersonAScanScreen({ navigation }: Props) {
  const [mode, setMode] = useState<ScanMode>('scanning');
  const [found, setFound] = useState(false);
  const { seconds, label } = useStopwatch();

  useEffect(() => {
    (async () => {
      const btOn = await checkBluetoothEnabled();
      if (!btOn) return setMode('bluetoothOff');
      const permitted = await checkNearbyDevicesPermission();
      if (!permitted) return setMode('permissionDenied');
    })();
  }, []);

  useEffect(() => {
    if (mode !== 'scanning') return;
    // TODO(integration): drive `found` from the real BLE discovery
    // callback instead of this timer. RSSI, UUIDs and raw frames are
    // intentionally never surfaced in this production UI.
    if (seconds >= DEMO_FOUND_AFTER_SECONDS) setFound(true);
    if (seconds >= SCAN_TIMEOUT_SECONDS && !found) setMode('empty');
  }, [seconds, mode, found]);

  if (mode === 'bluetoothOff') {
    return (
      <RecoveryScreen
        title="Bluetooth is turned off"
        message="Access Lock needs Bluetooth to find and connect to your locker. Turn it on in system settings to continue."
        primaryLabel="Open Bluetooth settings"
        onPrimary={() => {}}
        onCancel={() => navigation.navigate('LockerHome')}
        tone="danger"
      />
    );
  }

  if (mode === 'permissionDenied') {
    return (
      <RecoveryScreen
        title="Nearby devices permission needed"
        message="Access Lock can't scan for your locker without this permission. Grant it in app settings to continue."
        primaryLabel="Open app settings"
        onPrimary={() => {}}
        onCancel={() => navigation.navigate('LockerHome')}
        tone="amber"
      />
    );
  }

  if (mode === 'empty') {
    return (
      <RecoveryScreen
        title="No locker found nearby"
        message="Move closer to the locker and make sure Bluetooth is on. Only lockers enrolled to you will appear."
        primaryLabel="Scan again"
        onPrimary={() => {
          setMode('scanning');
          setFound(false);
        }}
        onCancel={() => navigation.navigate('LockerHome')}
        tone="neutral"
      />
    );
  }

  return (
    <ScreenContainer>
      <TopBar title="Scan for locker" onBack={() => navigation.navigate('LockerHome')} eyebrow="Person A · Request access" />
      <View style={styles.body}>
        <ScanRings color={colors.accent} centerIcon="bluetooth" />
        <Text style={styles.heading}>Searching for your assigned locker</Text>
        <Text style={styles.sub}>Scanning · {label}</Text>

        <View style={styles.statusCard}>
          <StatusRow label="Bluetooth" value="On" />
          <StatusRow label="Nearby devices permission" value="Granted" />
        </View>

        {found && (
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('PersonALockerFound')}
            style={styles.foundCard}
          >
            <View style={styles.foundIcon}>
              <Icon name="checkCircle" size={18} color={colors.success} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.foundTitle}>Vault Locker 01 found nearby</Text>
              <Text style={styles.foundSub}>Tap to continue</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.success} strokeWidth={2} />
          </Pressable>
        )}

        <View style={{ flex: 1 }} />
        <Button label="Stop scanning" variant="secondary" onPress={() => navigation.navigate('LockerHome')} />
      </View>
    </ScreenContainer>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={styles.statusValueRow}>
        <View style={styles.statusDot} />
        <Text style={styles.statusValue}>{value}</Text>
      </View>
    </View>
  );
}

function RecoveryScreen({
  title,
  message,
  primaryLabel,
  onPrimary,
  onCancel,
  tone
}: {
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  onCancel: () => void;
  tone: 'danger' | 'amber' | 'neutral';
}) {
  const bg = { danger: colors.dangerSoft, amber: colors.amberSoft, neutral: colors.neutralSoft }[tone];
  const fg = { danger: colors.danger, amber: colors.amber, neutral: colors.textTertiary }[tone];
  const icon = tone === 'neutral' ? 'bluetooth' : tone === 'amber' ? 'alertTriangle' : 'plugSlash';

  return (
    <ScreenContainer>
      <TopBar title="Scan for locker" onBack={onCancel} eyebrow="Person A · Request access" />
      <View style={styles.recoveryBody}>
        <View style={{ flex: 1 }} />
        <View style={[styles.recoveryIcon, { backgroundColor: bg }]}>
          <Icon name={icon as any} size={32} color={fg} strokeWidth={1.6} />
        </View>
        <Text style={styles.recoveryTitle}>{title}</Text>
        <Text style={styles.recoveryMessage}>{message}</Text>
        <View style={{ flex: 1 }} />
        <Button label={primaryLabel} onPress={onPrimary} style={{ marginBottom: 10 }} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 8, paddingBottom: 24 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, color: colors.textPrimary, marginTop: 8, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary, marginTop: 6 },
  statusCard: {
    width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, marginTop: 22, paddingHorizontal: 16
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  statusLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  statusValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.success },
  statusValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.success },
  foundCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', marginTop: 16,
    backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.successSoftBorder,
    borderRadius: 14, padding: 14
  },
  foundIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  foundTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.textPrimary },
  foundSub: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary },
  recoveryBody: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingBottom: 24 },
  recoveryIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  recoveryTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary, textAlign: 'center' },
  recoveryMessage: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 21 }
});
