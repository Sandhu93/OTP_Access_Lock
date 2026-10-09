import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
import { Icon } from './Icon';

/** Fail-closed reassurance pill shown on every error/failure screen. */
export function LockedPill() {
  return (
    <View style={styles.pill}>
      <Icon name="lock" size={13} color={colors.neutralText} strokeWidth={2} />
      <Text style={styles.text}>Locker remains locked</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.neutralSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
    marginBottom: 20
  },
  text: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.neutralText
  }
});
