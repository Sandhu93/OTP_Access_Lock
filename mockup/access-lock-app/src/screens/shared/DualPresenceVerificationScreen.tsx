import React, { useEffect, useRef } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Card } from '@/components/Card';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'DualPresenceVerification'>;

/**
 * Both active BLE sessions are checked against the approved request
 * before the backend issues a signed authorization token — proximity
 * alone is never treated as authorization.
 *
 * TODO(integration): replace the fixed timer below with a live
 * subscription to the backend authorization result, and navigate to
 * AuthorizationSuccess only once a real token is issued (or to a
 * FailureState route on denial/timeout/disconnect).
 */
export function DualPresenceVerificationScreen({ navigation }: Props) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <ScreenContainer>
      <TopBar title="Authorization" centered />
      <View style={styles.body}>
        <View style={styles.spinnerWrap}>
          <Animated.View style={[styles.spinnerRing, { transform: [{ rotate }] }]} />
          <Icon name="lock" size={40} color={colors.textPrimary} strokeWidth={1.6} />
        </View>

        <Text style={styles.title}>Verifying both people are present</Text>
        <Text style={styles.message}>
          Both active sessions are checked against the approved request before the backend issues authorization.
        </Text>

        <Card style={{ width: '100%', marginTop: 12 }}>
          <Row label="Person A" value="Connected" tone="success" />
          <Row label="Person B" value="Connected" tone="success" />
          <Row label="Backend authorization" value="Verifying" tone="amber" />
          <Row label="Locker" value="Locked" tone="neutral" last />
        </Card>

        <ErrorBanner
          tone="accent"
          text="Bluetooth proximity alone never proves identity or authorization — a signed token from the backend is required to unlock."
        />

        <View style={{ flex: 1 }} />
        {__DEV__ && (
          <Button label="Dev: simulate authorization →" variant="ghost" onPress={() => navigation.replace('AuthorizationSuccess')} />
        )}
      </View>
    </ScreenContainer>
  );
}

function Row({ label, value, tone, last }: { label: string; value: string; tone: 'success' | 'amber' | 'neutral'; last?: boolean }) {
  const color = { success: colors.success, amber: colors.amberText, neutral: colors.textPrimary }[tone];
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueRow}>
        {tone !== 'neutral' && <Icon name="checkCircle" size={15} color={color} strokeWidth={2.2} />}
        <Text style={[styles.rowValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 12, paddingBottom: 20, gap: 14 },
  spinnerWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  spinnerRing: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    borderWidth: 6, borderColor: colors.accentSoft, borderTopColor: colors.accent
  },
  title: { fontFamily: fonts.bold, fontSize: 19, color: colors.textPrimary, textAlign: 'center' },
  message: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border
  },
  rowLabel: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary },
  rowValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontFamily: fonts.semibold, fontSize: 13.5 }
});
