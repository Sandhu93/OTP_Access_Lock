import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StatusChip } from '@/components/StatusChip';
import { ScanRings } from '@/components/ScanRings';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonALockerFound'>;

export function PersonALockerFoundScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <TopBar title="Locker found" onBack={() => navigation.navigate('PersonAScan')} eyebrow="Person A · Request access" />
      <View style={styles.body}>
        <ScanRings color={colors.success} centerIcon="lock" size={210} showFoundDot />

        <Card style={{ width: '100%', marginTop: 14 }}>
          <View style={styles.row}>
            <View>
              <Text style={styles.name}>Vault Locker 01</Text>
              <Text style={styles.site}>Kochi Branch — Basement Vault</Text>
            </View>
            <StatusChip label="Enrolled" tone="success" icon="checkCircle" />
          </View>
          <View style={styles.chipRow}>
            <StatusChip label="Locked" tone="neutral" icon="lock" />
            <Text style={styles.meta}>2 of 3 approvals required</Text>
          </View>
        </Card>

        <View style={styles.noteRow}>
          <Icon name="lock" size={15} color={colors.textTertiary} strokeWidth={1.8} />
          <Text style={styles.noteText}>Connection is encrypted before any request is sent. Being nearby does not unlock the locker.</Text>
        </View>

        <View style={{ flex: 1 }} />
        <Button label="Connect to locker" onPress={() => navigation.navigate('PersonAConnected')} style={{ marginBottom: 10 }} />
        <Button label="Scan again" variant="secondary" onPress={() => navigation.navigate('PersonAScan')} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 8, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  name: { fontFamily: fonts.bold, fontSize: 18, color: colors.textPrimary },
  site: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16, paddingHorizontal: 4 },
  noteText: { flex: 1, fontFamily: fonts.regular, fontSize: 12.5, color: colors.textTertiary, lineHeight: 18 }
});
