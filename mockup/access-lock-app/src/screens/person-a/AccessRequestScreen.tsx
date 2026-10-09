import React, { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonAAccessRequest'>;

const REASONS = ['Cash replenishment', 'Audit / inspection', 'Document retrieval', 'Maintenance'];

export function PersonAAccessRequestScreen({ navigation }: Props) {
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');

  return (
    <ScreenContainer>
      <TopBar title="Access request" onBack={() => navigation.navigate('PersonAConnected')} eyebrow="Person A · Request access" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Card style={styles.lockerCard}>
          <View style={styles.lockerIcon}>
            <Icon name="lock" size={17} color={colors.textSecondary} strokeWidth={1.75} />
          </View>
          <View>
            <Text style={styles.lockerName}>Vault Locker 01</Text>
            <Text style={styles.lockerSite}>Kochi Branch — Basement Vault</Text>
          </View>
        </Card>

        <Text style={styles.label}>Reason for access</Text>
        <View style={styles.pillRow}>
          {REASONS.map((r) => {
            const on = r === reason;
            return (
              <Pressable key={r} onPress={() => setReason(r)} style={[styles.pill, on && styles.pillOn]}>
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{r}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Note for the reviewer (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a short note explaining why access is needed"
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={3}
          style={styles.textarea}
        />

        <Text style={styles.label}>Required approvers</Text>
        <Card>
          <View style={styles.policyRow}>
            <Text style={styles.policyLabel}>Policy</Text>
            <Text style={styles.policyValue}>2 of 3 approvals</Text>
          </View>
          <View style={styles.divider} />
          <Text style={styles.policyNote}>
            Priya N. and Arjun K. are enrolled and eligible to confirm as the second person at this locker. An
            administrator reviews every request in the security dashboard.
          </Text>
        </Card>

        <ErrorBanner
          tone="amber"
          text="Access requires administrator approval and a second enrolled person present at the locker. It will not open on this request alone."
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Submit access request"
          onPress={() => navigation.navigate('PersonAWaitingReview')}
          style={{ marginBottom: 8 }}
        />
        <Button label="Cancel" variant="ghost" onPress={() => navigation.navigate('PersonAConnected')} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 18 },
  lockerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  lockerIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.neutralSoft, alignItems: 'center', justifyContent: 'center' },
  lockerName: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.textPrimary },
  lockerSite: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textTertiary },
  label: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.textSecondary, marginBottom: -10 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { height: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.textPrimary },
  pillTextOn: { color: '#fff' },
  textarea: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, padding: 14,
    fontFamily: fonts.regular, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.surface,
    minHeight: 76, textAlignVertical: 'top'
  },
  policyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  policyLabel: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.textSecondary },
  policyValue: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  policyNote: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textTertiary, lineHeight: 18 },
  footer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.border }
});
