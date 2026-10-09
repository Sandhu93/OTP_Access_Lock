import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { StatusChip } from '@/components/StatusChip';
import { Icon } from '@/components/Icon';
import { colors, fonts, spacing } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'LockerHome'>;

type LockerData = {
  name: string;
  site: string;
  online: boolean;
  lastSeen: string;
};

/**
 * "My Lockers" — the enrolled user's home base. In production, `lockers`
 * comes from the backend (live status, last-seen, policy) rather than
 * this static demo array.
 */
export function LockerHomeScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Lockers</Text>
          <Text style={styles.subtitle}>4 lockers enrolled to you</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Help and troubleshooting" style={styles.helpBtn}>
          <Icon name="helpCircle" size={19} color={colors.textSecondary} strokeWidth={1.8} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Locked, idle */}
        <LockerCard
          data={{ name: 'Vault Locker 01', site: 'Kochi Branch — Basement Vault', online: true, lastSeen: 'just now' }}
        >
          <View style={styles.chipRow}>
            <StatusChip label="Locked" tone="neutral" icon="lock" />
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>2 of 3 approvals required</Text>
          </View>
          <Button label="Start access request" onPress={() => navigation.navigate('PersonAScan')} style={{ marginTop: 14 }} />
        </LockerCard>

        {/* Ready for second person */}
        <LockerCard
          data={{ name: 'Vault Locker 03', site: 'Chennai Hub — Strongroom B', online: true, lastSeen: 'just now' }}
          iconTone="success"
        >
          <View style={styles.chipRow}>
            <StatusChip label="Ready for second person" tone="success" icon="shieldFriends" />
          </View>
          <Text style={styles.metaText}>Priya N. requested access · approved by admin</Text>
          <Button
            label="Confirm presence"
            onPress={() => navigation.navigate('PersonBScan')}
            style={{ marginTop: 14, backgroundColor: colors.success }}
          />
        </LockerCard>

        {/* Awaiting approval */}
        <LockerCard
          data={{ name: 'Vault Locker 02', site: 'Kochi Branch — Basement Vault', online: true, lastSeen: '2 min ago' }}
          iconTone="amber"
        >
          <View style={styles.chipRow}>
            <StatusChip label="Awaiting approval" tone="amber" icon="clock" />
            <Text style={styles.metaText}>2 of 3 approvals required</Text>
          </View>
          <Button
            label="View request status"
            variant="secondary"
            onPress={() => navigation.navigate('PersonAWaitingReview')}
            style={{ marginTop: 14 }}
          />
        </LockerCard>

        {/* Unavailable */}
        <LockerCard
          data={{ name: 'Vault Locker 05', site: 'Kochi Branch — Strongroom A', online: false, lastSeen: '3 hours ago' }}
          muted
        >
          <View style={styles.chipRow}>
            <StatusChip label="Unavailable" tone="neutral" icon="xCircle" />
          </View>
          <Button label="Locker offline" disabled onPress={() => {}} style={{ marginTop: 14 }} />
        </LockerCard>
      </ScrollView>

      <BottomNav active="lockers" />
    </ScreenContainer>
  );
}

function LockerCard({
  data,
  children,
  muted,
  iconTone = 'neutral'
}: {
  data: LockerData;
  children: React.ReactNode;
  muted?: boolean;
  iconTone?: 'neutral' | 'success' | 'amber';
}) {
  const iconBg = { neutral: colors.neutralSoft, success: colors.successSoft, amber: colors.amberSoft }[iconTone];
  const iconColor = { neutral: colors.textSecondary, success: colors.success, amber: colors.amber }[iconTone];

  return (
    <Card style={muted ? { opacity: 0.85 } : undefined}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>
          <Icon name="lock" size={20} color={iconColor} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, muted && { color: colors.textSecondary }]}>{data.name}</Text>
          <Text style={styles.cardSite}>{data.site}</Text>
          <View style={styles.statusDotRow}>
            <View style={[styles.statusDot, { backgroundColor: data.online ? colors.success : colors.textTertiary }]} />
            <Text style={styles.cardMeta}>
              {data.online ? 'Online' : 'Offline'} · last seen {data.lastSeen}
            </Text>
          </View>
        </View>
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between'
  },
  title: { fontFamily: fonts.bold, fontSize: 23, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.regular, fontSize: 13, color: colors.textTertiary, marginTop: 2 },
  helpBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'
  },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 14 },
  cardTop: { flexDirection: 'row', gap: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.textPrimary },
  cardSite: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  cardMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  metaDot: { color: colors.textTertiary },
  metaText: { fontFamily: fonts.regular, fontSize: 12, color: colors.textTertiary, marginTop: 8 }
});
