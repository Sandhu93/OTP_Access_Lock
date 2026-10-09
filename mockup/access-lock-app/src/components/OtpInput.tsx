import React, { useRef } from 'react';
import { NativeSyntheticEvent, StyleSheet, TextInput, TextInputKeyPressEventData, View } from 'react-native';
import { colors, fonts, radii } from '@/theme/tokens';

const LENGTH = 6;

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  error?: boolean;
  disabled?: boolean;
};

/**
 * Six separate accessible digit fields with auto-advance and
 * backspace-to-previous. Never renders the correct code — this is a
 * pure controlled input the person types into.
 */
export function OtpInput({ value, onChange, error, disabled }: Props) {
  const refs = useRef<Array<TextInput | null>>([]);

  const setDigit = (index: number, raw: string) => {
    const digit = raw.replace(/[^0-9]/g, '').slice(-1);
    const next = [...value];
    next[index] = digit;
    onChange(next);
    if (digit && index < LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const onKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row} accessibilityRole="none" accessibilityLabel="6-digit confirmation code">
      {Array.from({ length: LENGTH }).map((_, i) => (
        <TextInput
          key={i}
          ref={(r) => (refs.current[i] = r)}
          value={value[i] ?? ''}
          onChangeText={(t) => setDigit(i, t)}
          onKeyPress={(e) => onKeyPress(i, e)}
          keyboardType="number-pad"
          maxLength={1}
          editable={!disabled}
          accessibilityLabel={`Digit ${i + 1}`}
          style={[
            styles.box,
            error && styles.boxError,
            disabled && styles.boxDisabled
          ]}
        />
      ))}
    </View>
  );
}

export function emptyOtp(): string[] {
  return Array.from({ length: LENGTH }, () => '');
}

export function isOtpComplete(value: string[]): boolean {
  return value.length === LENGTH && value.every((d) => d !== '');
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 9
  },
  box: {
    width: 46,
    height: 56,
    borderRadius: radii.btn,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontFamily: fonts.monoSemibold,
    fontSize: 24,
    color: colors.textPrimary
  },
  boxError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    color: colors.dangerText
  },
  boxDisabled: {
    backgroundColor: colors.neutralSoft,
    color: colors.textTertiary
  }
});
