import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
import { Icon, IconName } from './Icon';

export type BannerTone = 'accent' | 'success' | 'amber' | 'danger';

const TONE: Record<BannerTone, { bg: string; border: string; fg: string; icon: IconName }> = {
  accent: { bg: colors.accentSoft, border: colors.accentSoftBorder, fg: colors.accent600, icon: 'shield' },
  success: { bg: colors.successSoft, border: colors.successSoftBorder, fg: colors.success, icon: 'lock' },
  amber: { bg: colors.amberSoft, border: colors.amberSoftBorder, fg: colors.amberText, icon: 'alertTriangle' },
  danger: { bg: colors.dangerSoft, border: colors.dangerSoftBorder, fg: colors.dangerText, icon: 'xCircle' }
};

export function ErrorBanner({ text, tone, icon }: { text: string; tone: BannerTone; icon?: IconName }) {
  const t = TONE[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Icon name={icon ?? t.icon} size={16} color={t.fg} strokeWidth={1.8} />
      <Text style={[styles.text, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14
  },
  text: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    lineHeight: 18
  }
});
