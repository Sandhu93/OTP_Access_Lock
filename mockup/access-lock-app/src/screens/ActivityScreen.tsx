import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/Card';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Activity'>;

type Outcome = 'Completed' | 'Rejected' | 'Expired' | 'Cancelled' | 'Failed';

type Entry = {
  locker: string;
  site: string;
  when: string;
  outcome: Outcome;
  requester: string;
  admin: string;
  secondPerson: string;
  reference: string;
};

const OUTCOME_STYLE: Record<Outcome, { bg: string; fg: string; border: string }> = {
  Completed: { bg: colors.successSoft, fg: colors.success, border: colors.successSoftBorder },
  Rejected: { bg: colors.dangerSoft, fg: colors.dangerText, border: colors.dangerSoftBorder },
  Failed: { bg: colors.dangerSoft, fg: colors.dangerText, border: colors.dangerSoftBorder },
  Expired: { bg: colors.neutralSoft, fg: colors.neutralText, border: colors.neutralSoft },
  Cancelled: { bg: colors.neutralSoft, fg: colors.neutralText, border: colors.neutralSoft }
};

// TODO(integration): replace with the user's paginated history from
// the backend. Never include raw tokens, secrets or protocol frames.
const ENTRIES: Entry[] = [
  { locker: 'Vault Locker 01', site: 'Kochi Branch', when: '24 Sep 2026, 15:42 IST', outcome: 'Completed', requester: 'You (Person A)', admin: 'Approved', secondPerson: 'Priya N. confirmed', reference: 'AL-20394' },
  { locker: 'Vault Locker 03', site: 'Chennai Hub', when: '22 Sep 2026, 10:05 IST', outcome: 'Completed', requester: 'Arjun K.', admin: 'Approved', secondPerson: 'You confirmed', reference: 'AL-20361' },
  { locker: 'Vault Locker 01', site: 'Kochi Branch', when: '19 Sep 2026, 17:20 IST', outcome: 'Rejected', requester: 'You (Person A)', admin: 'Rejected', secondPerson: 'Not required', reference: 'AL-20288' },
  { locker: 'Vault Locker 02', site: 'Kochi Branch', when: '15 Sep 2026, 09:48 IST', outcome: 'Expired', requester: 'You (Person A)', admin: 'Approved', secondPerson: 'Never connected', reference: 'AL-20177' },
  { locker: 'Vault Locker 01', site: 'Kochi Branch', when: '11 Sep 2026, 13:02 IST', outcome: 'Cancelled', requester: 'You (Person A)', admin: 'Not reached', secondPerson: 'Cancelled by you before review', reference: 'AL-20103' },
  { locker: 'Vault Locker 01', site: 'Kochi Branch', when: '3 Sep 2026, 08:31 IST', outcome: 'Failed', requester: 'You (Person A)', admin: 'Approved', secondPerson: 'Attempt limit reached', reference: 'AL-20044' }
];

export function ActivityScreen({}: Props) {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>Your access request history</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {ENTRIES.map((e, i) => {
          const tone = OUTCOME_STYLE[e.outcome];
          return (
            <Card key={i}>
              <View style={styles.row}>
                <View>
                  <Text style={styles.locker}>{e.locker}</Text>
                  <Text style={styles.meta}>{e.site} — {e.when}</Text>
                </View>
                <View style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                  <Text style={[styles.chipText, { color: tone.fg }]}>{e.outcome}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaSmall}>Requester: {e.requester}</Text>
                <Text style={styles.metaSmall}>Admin: {e.admin}</Text>
              </View>
              <View style={[styles.metaRow, { marginTop: 2 }]}>
                <Text style={styles.metaSmall}>{e.secondPerson}</Text>
                <Text style={styles.metaMono}>{e.reference}</Text>
              </View>
            </Card>
          );
        })}
      </ScrollView>

      <BottomNav active="activity" />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 14 },
  title: { fontFamily: fonts.bold, fontSize: 23, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary, marginTop: 2 },
  scroll: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  locker: { fontFamily: fonts.bold, fontSize: 14.5, color: colors.textPrimary },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary },
  chip: { height: 23, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.bold, fontSize: 11.5 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  metaSmall: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textTertiary },
  metaMono: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary }
});
