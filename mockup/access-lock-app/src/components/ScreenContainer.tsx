import React, { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';

/**
 * Standard screen shell: safe-area aware, no fake status bar or
 * keyboard drawn — the real OS chrome renders on top of this.
 */
export function ScreenContainer({ children, dark }: PropsWithChildren<{ dark?: boolean }>) {
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dark ? colors.dbgBg : colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.flex}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 }
});
