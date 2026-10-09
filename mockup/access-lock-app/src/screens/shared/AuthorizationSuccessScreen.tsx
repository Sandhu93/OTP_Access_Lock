import React, { useEffect, useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';
import { useCountdown } from '@/hooks/useCountdown';

type Props = NativeStackScreenProps<RootStackParamList, 'AuthorizationSuccess'>;

const ACTION_WINDOW_SECONDS = 120;

/**
 * TODO(integration): flip `opened` from the locker's real completion
 * report (UNLOCK_OK → physical actuation confirmed), not a timer. On
 * the current MVP hardware that actuation is an LED test — that detail
 * stays inside the Bench Test screen and is never surfaced here.
 */
export function AuthorizationSuccessScreen({ navigation }: Props) {
  const [opened, setOpened] = useState(false);
  const { label } = useCountdown(ACTION_WINDOW_SECONDS);

  useEffect(() => {
    const t = setTimeout(() => setOpened(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <ScreenContainer>
      <TopBar title="Authorization" centered />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconCircle}>
          <Icon name="checkCircle" size={44} color={colors.success} strokeWidth={2} />
        </View>
        <Text style={styles.title}>Access authorized</Text>
        <Text style={styles.sub}>Vault Locker 01 · Kochi Branch</Text>

        <View style={styles.card}>
          <Row label="Presence" value="Both required people confirmed" />
          <Row label="Authorization" value="Issued" />
          <Row label="Locker" value={opened ? 'Opened — access complete' : 'Unlocking…'} tone={opened ? 'success' : 'amber'} last />
        </View>

        <View style={styles.windowCard}>
          <Text style={styles.windowTitle}>Open the physical locker now</Text>
          <Text style={styles.windowSub}>Remaining action window: {label}</Text>
        </View>

        <View style={styles.refRow}>
          <Text style={styles.refText}>Reference AL-20394</Text>
          <Text style={styles.refTimestamp}>24 Sep 2026 · 15:42 IST</Text>
        </View>

        <View style={{ flex: 1 }} />
        <Button label="Finish" onPress={() => navigation.navigate('LockerHome')} style={{ marginTop: 20, marginBottom: 8, backgroundColor: colors.success }} />
        <Button label="View activity" variant="ghost" onPress={() => navigation.navigate('Activity')} />
      </ScrollView>
    </ScreenContainer>
  );
}

function Row({ label, value, tone, last }: { label: string; value: string; tone?: 'success' | 'amber'; last?: boolean }) {
  const color = tone === 'amber' ? colors.amberText : colors.success;
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 10, paddingBottom: 20, flexGrow: 1 },
  iconCircle: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: colors.successSoft,
    borderWidth: 1.5, borderColor: colors.successSoftBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 16
  },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.textPrimary },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, marginTop: 6 },
  card: {
    width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, marginTop: 20, paddingHorizontal: 18
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  rowLabel: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.textSecondary },
  rowValue: { fontFamily: fonts.semibold, fontSize: 13.5 },
  windowCard: {
    width: '100%', backgroundColor: colors.amberSoft, borderWidth: 1, borderColor: colors.amberSoftBorder,
    borderRadius: 14, padding: 14, marginTop: 14, alignItems: 'center'
  },
  windowTitle: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.amberText },
  windowSub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.amberText, marginTop: 4 },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 16, paddingHorizontal: 2 },
  refText: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.textTertiary },
  refTimestamp: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textTertiary }
});
