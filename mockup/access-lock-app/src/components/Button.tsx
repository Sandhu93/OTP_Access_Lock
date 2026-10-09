import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, fonts, radii } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
};

/**
 * Full-width action button, 50px tall (≥44px touch target).
 * `disabled` renders a visibly inert state — never fake-disable by
 * hiding onPress while keeping full-color styling.
 */
export function Button({ label, onPress, variant = 'primary', disabled, loading, style, accessibilityHint }: Props) {
  const isInteractive = !disabled && !loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !isInteractive }}
      accessibilityHint={accessibilityHint}
      onPress={isInteractive ? onPress : undefined}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        disabled && styles.disabled,
        pressed && isInteractive && styles.pressed,
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.accent : '#fff'} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'secondary' && { color: colors.textPrimary },
            variant === 'ghost' && { color: colors.accent },
            (variant === 'primary' || variant === 'danger') && { color: '#fff' },
            disabled && { color: colors.textTertiary }
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: radii.btn,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  pressed: {
    opacity: 0.85
  },
  disabled: {
    backgroundColor: colors.neutralSoft,
    borderColor: colors.neutralSoft
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 15
  }
});

const variantStyles: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent', height: 48 },
  danger: { backgroundColor: colors.danger }
};
