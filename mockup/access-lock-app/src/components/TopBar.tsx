import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
import { Icon } from './Icon';

type Props = {
  title: string;
  onBack?: () => void;
  /** Small uppercase pill under the title, e.g. "Person A · Request access" */
  eyebrow?: string;
  eyebrowTone?: 'accent' | 'success' | 'amber';
  centered?: boolean;
};

export function TopBar({ title, onBack, eyebrow, eyebrowTone = 'accent', centered }: Props) {
  const eyebrowColors = {
    accent: { bg: colors.accentSoft, fg: colors.accent600 },
    success: { bg: colors.successSoft, fg: colors.success },
    amber: { bg: colors.amberSoft, fg: colors.amberText }
  }[eyebrowTone];

  return (
    <View>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Icon name="chevronLeft" size={18} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.backBtnGhost} />
        )}
        <Text
          style={[styles.title, centered && { flex: 1, textAlign: 'center', marginRight: onBack ? 0 : 36 }]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      {eyebrow ? (
        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrow, { backgroundColor: eyebrowColors.bg }]}>
            <Text style={[styles.eyebrowText, { color: eyebrowColors.fg }]}>{eyebrow.toUpperCase()}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backBtnGhost: {
    width: 36,
    height: 36
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.textPrimary
  },
  eyebrowRow: {
    paddingHorizontal: 20,
    paddingTop: 10
  },
  eyebrow: {
    alignSelf: 'flex-start',
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eyebrowText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.4
  }
});
