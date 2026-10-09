import React, { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { ScanRings } from '@/components/ScanRings';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonBScan'>;

const EXPECTED_LOCKER = 'Vault Locker 01';
const DEMO_FOUND_AFTER_SECONDS = 2;

export function PersonBScanScreen({ navigation }: Props) {
  const [connected, setConnected] = useState(false);
  // TODO(integration): set from the real discovered-device name/id,
  // compared against the locker linked to the approved request.
  const [discoveredLocker] = useState(EXPECTED_LOCKER);
  const wrongLocker = connected && discoveredLocker !== EXPECTED_LOCKER;

  useEffect(() => {
    const t = setTimeout(() => setConnected(true), DEMO_FOUND_AFTER_SECONDS * 1000);
    return () => clearTimeout(t);
  }, []);

  if (wrongLocker) {
    return (
      <ScreenContainer>
        <TopBar title="Confirm presence" onBack={() => navigation.navigate('LockerHome')} eyebrow="Person B · Confirm presence" eyebrowTone="success" />
        <View style={styles.recovery}>
          <View style={{ flex: 1 }} />
          <View style={styles.recoveryIcon}>
            <Icon name="alertTriangle" size={32} color={colors.amber} strokeWidth={1.6} />
          </View>
          <Text style={styles.recoveryTitle}>This isn't the locker on your request</Text>
          <Text style={styles.recoveryMessage}>
            You connected to <Text style={styles.bold}>{discoveredLocker}</Text>, but request AL-20394 is for{' '}
            <Text style={styles.bold}>{EXPECTED_LOCKER}</Text>. Move to the correct locker and scan again.
          </Text>
          <View style={{ flex: 1 }} />
          <Button label="Scan again" onPress={() => navigation.replace('PersonBScan')} style={{ marginBottom: 10 }} />
          <Button label="Cancel" variant="secondary" onPress={() => navigation.navigate('LockerHome')} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <TopBar title="Confirm presence" onBack={() => navigation.navigate('LockerHome')} eyebrow="Person B · Confirm presence" eyebrowTone="success" />
      <View style={styles.body}>
        <ScanRings color={connected ? colors.success : colors.accent} centerIcon="bluetooth" showFoundDot={connected} />

        <Text style={styles.heading}>Scan for the locker linked to your request</Text>
        <Text style={styles.sub}>
          Looking for <Text style={styles.bold}>{EXPECTED_LOCKER}</Text> · request AL-20394
        </Text>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Bluetooth</Text>
            <View style={styles.statusValueRow}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={[styles.statusValue, { color: colors.success }]}>On</Text>
            </View>
          </View>
          <View style={[styles.statusRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.statusLabel}>Connection</Text>
            <Text style={[styles.statusValue, { color: connected ? colors.success : colors.accent }]}>
              {connected ? 'Connected' : 'Searching…'}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />
        <Button label="Connect to locker" disabled={!connected} onPress={() => navigation.navigate('PersonBOtp')} style={{ marginBottom: 10 }} />
        <Button label="Cancel" variant="secondary" onPress={() => navigation.navigate('LockerHome')} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 8, paddingBottom: 24 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, color: colors.textPrimary, marginTop: 8, textAlign: 'center' },
  sub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary, marginTop: 6, textAlign: 'center' },
  bold: { fontFamily: fonts.semibold, color: colors.textSecondary },
  statusCard: {
    width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 14, marginTop: 20, paddingHorizontal: 16
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  statusLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  statusValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  statusValue: { fontFamily: fonts.semibold, fontSize: 13 },
  recovery: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingBottom: 24 },
  recoveryIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  recoveryTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary, textAlign: 'center' },
  recoveryMessage: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 21 }
});
