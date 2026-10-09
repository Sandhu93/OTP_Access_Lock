import React, { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'UnlockGate'>;

const PIN_LENGTH = 6;
const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * Local device authentication only — never a sign-in screen. Confirms
 * it's you on this device before showing any locker or request data.
 *
 * Wire `handleBiometric` to `expo-local-authentication`
 * (LocalAuthentication.authenticateAsync) against the platform
 * biometric APIs; PIN is a local-only fallback, never transmitted.
 */
export function UnlockGateScreen({ navigation }: Props) {
  const [mode, setMode] = useState<'biometric' | 'pin'>('biometric');
  const [pin, setPin] = useState('');

  const pinComplete = pin.length === PIN_LENGTH;

  async function handleBiometric() {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify it’s you to continue',
        cancelLabel: 'Use PIN instead'
      });
      if (result.success) {
        navigation.replace('LockerHome');
      }
    } catch {
      // Biometric hardware unavailable — fall back to PIN.
      setMode('pin');
    }
  }

  function pressKey(key: string) {
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === '' || pin.length >= PIN_LENGTH) return;
    setPin((p) => p + key);
  }

  return (
    <ScreenContainer>
      {mode === 'biometric' ? (
        <View style={styles.center}>
          <View style={{ flex: 1 }} />
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Icon name="lock" size={24} color={colors.accent} />
            </View>
            <Text style={styles.brandTitle}>Access Lock</Text>
            <Text style={styles.brandSubtitle}>Enterprise split-trust lockers</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Unlock with biometrics"
            onPress={handleBiometric}
            style={styles.bioCircle}
          >
            <Icon name="fingerprint" size={40} color={colors.accent} strokeWidth={1.6} />
          </Pressable>
          <Pressable onPress={handleBiometric}>
            <Text style={styles.tapLabel}>Tap to verify biometrics</Text>
          </Pressable>
          <Text style={styles.helperText}>Confirms it's you on this device</Text>

          <View style={{ flex: 1 }} />
          <Button label="Use PIN instead" variant="ghost" onPress={() => setMode('pin')} />
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.pinTitle}>Enter your PIN</Text>
          <Text style={styles.helperText}>Local device authentication</Text>

          <View style={styles.dotsRow}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
            ))}
          </View>

          {pinComplete && (
            <View style={styles.verifiedRow}>
              <Icon name="checkCircle" size={18} color={colors.success} strokeWidth={2.2} />
              <Text style={styles.verifiedText}>PIN verified</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          <View style={styles.keypad}>
            {KEYPAD.map((key, i) => (
              <Pressable
                key={i}
                disabled={key === ''}
                onPress={() => pressKey(key)}
                accessibilityLabel={key === '⌫' ? 'Backspace' : `Digit ${key}`}
                style={({ pressed }) => [styles.key, key === '' && { opacity: 0 }, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <Text style={styles.keyText}>{key}</Text>
              </Pressable>
            ))}
          </View>

          <Button
            label="Continue"
            disabled={!pinComplete}
            onPress={() => navigation.replace('LockerHome')}
            style={{ marginBottom: 8 }}
          />
          <Button label="Use biometrics instead" variant="ghost" onPress={() => { setMode('biometric'); setPin(''); }} />
        </View>
      )}
      <Text style={styles.footer}>Local device check only — this does not sign in an account</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 8 },
  brandRow: { alignItems: 'center', gap: 6, marginBottom: 56 },
  brandIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center'
  },
  brandTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.textPrimary },
  brandSubtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary },
  bioCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 28
  },
  tapLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary, marginBottom: 4 },
  helperText: { fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
  pinTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.textPrimary, marginTop: 24, marginBottom: 4 },
  dotsRow: { flexDirection: 'row', gap: 14, marginTop: 32, marginBottom: 24 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderStrong },
  dotFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  verifiedText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.success },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', gap: 14, marginBottom: 24 },
  key: {
    width: '30%', height: 64, borderRadius: 16, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center'
  },
  keyText: { fontFamily: fonts.medium, fontSize: 22, color: colors.textPrimary },
  footer: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 11, color: colors.textTertiary, paddingBottom: 20 }
});
