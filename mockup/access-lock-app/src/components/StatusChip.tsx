import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii } from '@/theme/tokens';
import { Icon, IconName } from './Icon';

export type ChipTone = 'neutral' | 'accent' | 'amber' | 'success' | 'danger';

type Props = {
  label: string;
  tone: ChipTone;
  icon: IconName;
};

const TONE: Record<ChipTone, { bg: string; fg: string; border?: string }> = {
  neutral: { bg: colors.neutralSoft, fg: colors.neutralText },
  accent: { bg: colors.accentSoft, fg: colors.accent600, border: colors.accentSoftBorder },
  amber: { bg: colors.amberSoft, fg: colors.amberText, border: colors.amberSoftBorder },
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successSoftBorder },
  danger: { bg: colors.dangerSoft, fg: colors.dangerText, border: colors.dangerSoftBorder }
};

/** Status is always icon + label together — never color alone. */
export function StatusChip({ label, tone, icon }: Props) {
  const t = TONE[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border ?? t.bg }]}>
      <Icon name={icon} size={13} color={t.fg} strokeWidth={2} />
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12
  }
});
