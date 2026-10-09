import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Timeline } from '@/components/Timeline';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonAWaitingReview'>;

/**
 * Admin review happens in the separate security dashboard, not in this
 * app — there is no in-app approval action. TODO(integration): replace
 * the dev-only "simulate" button below with a live subscription
 * (push notification or socket) that navigates on to
 * PersonAApprovedWaitingB automatically once the backend approves.
 */
export function PersonAWaitingReviewScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <TopBar title="Access request" centered eyebrow="Waiting for security review" eyebrowTone="amber" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.requestHead}>
          <Text style={styles.requestLabel}>Request</Text>
          <Text style={styles.requestId}>AL-20394</Text>
          <Text style={styles.requestSub}>Vault Locker 01 · Kochi Branch</Text>
        </View>

        <Card>
          <Timeline
            steps={[
              { label: 'Request submitted', sublabel: 'By you, just now', status: 'done' },
              { label: 'Administrator review', sublabel: 'In progress in the security dashboard', status: 'current' },
              { label: 'Second person confirmation', sublabel: 'Not started', status: 'pending' },
              { label: 'Final authorization', sublabel: 'Not started', status: 'pending' }
            ]}
          />
        </Card>

        <Text style={styles.estimate}>Typically reviewed within business hours — no exact time is promised</Text>

        <ErrorBanner tone="success" text="The locker remains locked until all required checks are complete." />

        <Button label="Cancel request" variant="secondary" onPress={() => navigation.navigate('LockerHome')} />

        {__DEV__ && (
          <Button
            label="Dev: simulate admin approval →"
            variant="ghost"
            onPress={() => navigation.replace('PersonAApprovedWaitingB')}
          />
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24, gap: 18 },
  requestHead: { alignItems: 'center', marginBottom: 4 },
  requestLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary },
  requestId: { fontFamily: fonts.monoSemibold, fontSize: 18, color: colors.textPrimary, letterSpacing: 0.5 },
  requestSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  estimate: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 12.5, color: colors.textTertiary }
});
