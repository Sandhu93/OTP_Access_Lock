import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { StatusChip } from '@/components/StatusChip';
import { OtpInput, emptyOtp } from '@/components/OtpInput';
import { Timeline } from '@/components/Timeline';
import { ErrorBanner } from '@/components/ErrorBanner';
import { colors, fonts, spacing } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'StyleGuide'>;

/**
 * Live component gallery — dev-only. Every element here renders with
 * the real shared components, so it can never drift from the actual
 * screens the way a static picture can.
 */
export function StyleGuideScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <TopBar title="Design system" onBack={() => navigation.navigate('LockerHome')} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Label text="Color" />
        <View style={styles.swatchGrid}>
          {[
            ['Accent', colors.accent],
            ['Success', colors.success],
            ['Amber', colors.amber],
            ['Danger', colors.danger]
          ].map(([name, hex]) => (
            <View key={name} style={[styles.swatch, { backgroundColor: hex as string }]}>
              <Text style={styles.swatchText}>{name}</Text>
            </View>
          ))}
        </View>

        <Label text="Typography" />
        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 22 }}>Title 22 / Bold</Text>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 17 }}>Heading 17 / Semibold</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 15, color: colors.textSecondary }}>Body 15 / Regular</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary }}>Caption 13 / Regular</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 24, letterSpacing: 2 }}>4 1 0 7 2 9</Text>
        </Card>

        <Label text="Buttons" />
        <View style={{ gap: 10 }}>
          <Button label="Primary" onPress={() => {}} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <Button label="Ghost" variant="ghost" onPress={() => {}} />
          <Button label="Disabled" disabled onPress={() => {}} />
        </View>

        <Label text="Status chips" />
        <View style={styles.chipRow}>
          <StatusChip label="Locked" tone="neutral" icon="lock" />
          <StatusChip label="Awaiting approval" tone="amber" icon="clock" />
          <StatusChip label="Ready for second person" tone="success" icon="shieldFriends" />
          <StatusChip label="Rejected" tone="danger" icon="xCircle" />
        </View>

        <Label text="OTP field" />
        <Card>
          <OtpInput value={['4', '1', '', '', '', '']} onChange={() => {}} />
        </Card>

        <Label text="Timeline" />
        <Card>
          <Timeline
            steps={[
              { label: 'Request submitted', status: 'done' },
              { label: 'Administrator review', status: 'current' },
              { label: 'Final authorization', status: 'pending' }
            ]}
          />
        </Card>

        <Label text="Banners" />
        <View style={{ gap: 10 }}>
          <ErrorBanner tone="accent" text="Connection is encrypted before any request is sent." />
          <ErrorBanner tone="success" text="The locker remains locked until all required checks are complete." />
          <ErrorBanner tone="amber" text="Access requires administrator approval and a second enrolled person." />
          <ErrorBanner tone="danger" text="Incorrect code. 1 attempt remaining." />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: 20 },
  label: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: colors.textTertiary, textTransform: 'uppercase' },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: '47%', height: 56, borderRadius: 12, justifyContent: 'flex-end', padding: 10 },
  swatchText: { fontFamily: fonts.semibold, fontSize: 12, color: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }
});
