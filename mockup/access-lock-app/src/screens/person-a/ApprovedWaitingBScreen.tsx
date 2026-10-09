import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';
import { useCountdown } from '@/hooks/useCountdown';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonAApprovedWaitingB'>;

const REQUEST_WINDOW_SECONDS = 15 * 60;

export function PersonAApprovedWaitingBScreen({ navigation }: Props) {
  const { label } = useCountdown(REQUEST_WINDOW_SECONDS, () => navigation.replace('FailureState', { type: 'requestExpired' }));

  return (
    <ScreenContainer>
      <TopBar title="Active request" centered eyebrow="Request approved" eyebrowTone="success" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconCircle}>
          <Icon name="checkCircle" size={30} color={colors.success} strokeWidth={2} />
        </View>
        <Text style={styles.title}>Request approved</Text>
        <Text style={styles.message}>Priya N. or Arjun K. must now join you at the locker to confirm presence.</Text>

        <Card style={{ width: '100%' }}>
          <Text style={styles.lockerName}>Vault Locker 01</Text>
          <Text style={styles.lockerSite}>Kochi Branch — Basement Vault</Text>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Your connection</Text>
            <View style={styles.rowValueRow}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={[styles.rowValue, { color: colors.success }]}>Connected</Text>
            </View>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>Second person</Text>
            <Text style={[styles.rowValue, { color: colors.amberText }]}>Not yet connected</Text>
          </View>
        </Card>

        <View style={styles.countdownBlock}>
          <Text style={styles.countdownLabel}>REQUEST EXPIRES IN</Text>
          <Text style={styles.countdownValue}>{label}</Text>
        </View>

        <ErrorBanner tone="accent" text="Keep this phone connected and remain with the locker until the second person arrives." />

        <Button label="Cancel request" variant="secondary" onPress={() => navigation.navigate('LockerHome')} />

        {__DEV__ && (
          <Button
            label="Dev: simulate Person B connecting →"
            variant="ghost"
            onPress={() => navigation.navigate('DualPresenceVerification', { role: 'A' })}
          />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 24, gap: 16 },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.successSoft,
    borderWidth: 1.5, borderColor: colors.successSoftBorder, alignItems: 'center', justifyContent: 'center'
  },
  title: { fontFamily: fonts.bold, fontSize: 19, color: colors.textPrimary },
  message: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  lockerName: { fontFamily: fonts.bold, fontSize: 15.5, color: colors.textPrimary },
  lockerSite: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textTertiary, marginBottom: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  rowLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  rowValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  rowValue: { fontFamily: fonts.semibold, fontSize: 13 },
  countdownBlock: { alignItems: 'center' },
  countdownLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.textTertiary, letterSpacing: 0.5 },
  countdownValue: { fontFamily: fonts.monoSemibold, fontSize: 34, color: colors.textPrimary, marginTop: 4 }
});
