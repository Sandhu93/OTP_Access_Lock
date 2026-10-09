import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonAConnected'>;

/**
 * Locker is connected but intentionally shows no "Unlock" control —
 * the locker must remain visibly locked until the full 2-of-3 policy
 * clears. Only "Request access" moves the flow forward.
 */
export function PersonAConnectedScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <TopBar title="Locker connected" centered eyebrow="Person A · Request access" />
      <View style={styles.body}>
        <View style={styles.ring}>
          <View style={styles.ringInner}>
            <Icon name="lock" size={38} color={colors.success} strokeWidth={1.6} />
          </View>
        </View>

        <Text style={styles.name}>Vault Locker 01</Text>
        <Text style={styles.site}>Kochi Branch — Basement Vault</Text>

        <View style={styles.statusCard}>
          <StatusRow label="BLE connection" value="Connected" icon="bluetooth" />
          <StatusRow label="Session" value="Secure session established" icon="shield" />
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Locker state</Text>
            <Text style={styles.lockedValue}>Locked</Text>
          </View>
        </View>

        <ErrorBanner
          tone="accent"
          icon="shieldFriends"
          text="2 of 3 approvals required — a second enrolled person and an administrator must both confirm before this locker opens."
        />

        <View style={{ flex: 1 }} />
        <Button label="Request access" onPress={() => navigation.navigate('PersonAAccessRequest')} style={{ marginBottom: 10 }} />
        <Button label="Disconnect" variant="secondary" onPress={() => navigation.navigate('LockerHome')} />
      </View>
    </ScreenContainer>
  );
}

function StatusRow({ label, value, icon }: { label: string; value: string; icon: 'bluetooth' | 'shield' }) {
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusLabelRow}>
        <Icon name={icon} size={15} color={colors.textSecondary} strokeWidth={1.8} />
        <Text style={styles.statusLabel}>{label}</Text>
      </View>
      <View style={styles.statusValueRow}>
        <View style={styles.dot} />
        <Text style={styles.statusValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 10, paddingBottom: 24 },
  ring: {
    width: 140, height: 140, borderRadius: 70, backgroundColor: colors.successSoft,
    borderWidth: 1.5, borderColor: colors.successSoftBorder, alignItems: 'center', justifyContent: 'center',
    marginTop: 16, marginBottom: 18
  },
  ringInner: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.success, alignItems: 'center', justifyContent: 'center'
  },
  name: { fontFamily: fonts.bold, fontSize: 19, color: colors.textPrimary },
  site: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  statusCard: {
    width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, marginTop: 20, marginBottom: 14, paddingHorizontal: 16
  },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  statusLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusLabel: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.textSecondary },
  statusValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.success },
  statusValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.success },
  lockedValue: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textPrimary }
});
