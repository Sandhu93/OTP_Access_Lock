import React from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/Button';
import { Icon, IconName } from '@/components/Icon';
import { LockedPill } from '@/components/LockedPill';
import { colors, fonts } from '@/theme/tokens';
import { FailureType } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FailureState'>;

type Config = {
  icon: IconName;
  tone: 'amber' | 'danger' | 'neutral';
  title: string;
  message: string;
  primaryLabel: string;
  primaryRoute: keyof RootStackParamList;
  secondaryLabel: string;
};

/**
 * One fail-closed template for every terminal error the app can hit.
 * Every state keeps the locker locked, explains the next safe step,
 * and never offers a "try opening manually" escape hatch.
 */
const CONFIG: Record<FailureType, Config> = {
  connectionFailed: {
    icon: 'plugSlash', tone: 'amber',
    title: "Couldn't connect to the locker",
    message: 'The connection attempt timed out. Move closer to the locker and try again.',
    primaryLabel: 'Try again', primaryRoute: 'PersonAScan', secondaryLabel: 'Cancel request'
  },
  encryptionNotEstablished: {
    icon: 'shieldSlash', tone: 'danger',
    title: 'Secure connection not established',
    message: "The encrypted session with the locker couldn't be verified, so no request was sent. This protects against an unverified connection.",
    primaryLabel: 'Try again', primaryRoute: 'PersonAScan', secondaryLabel: 'Contact administrator'
  },
  lockerDisconnected: {
    icon: 'plugSlash', tone: 'amber',
    title: 'Locker disconnected',
    message: 'The connection to the locker was lost. Reconnect to continue — nothing was authorized.',
    primaryLabel: 'Reconnect', primaryRoute: 'PersonAScan', secondaryLabel: 'Cancel request'
  },
  adminRejected: {
    icon: 'xCircle', tone: 'danger',
    title: 'Administrator rejected this request',
    message: 'Your request for Vault Locker 01 was not approved. Contact your administrator if you believe this is a mistake.',
    primaryLabel: 'Back to Lockers', primaryRoute: 'LockerHome', secondaryLabel: 'Contact administrator'
  },
  requestExpired: {
    icon: 'clock', tone: 'neutral',
    title: 'Request expired',
    message: "This request wasn't completed in time and closed automatically. Start a new request if access is still needed.",
    primaryLabel: 'Start a new request', primaryRoute: 'PersonAScan', secondaryLabel: 'Back to Lockers'
  },
  personADisconnected: {
    icon: 'userSlash', tone: 'danger',
    title: 'Person A disconnected',
    message: "The requester's connection was lost during final verification. Authorization was not issued.",
    primaryLabel: 'Back to Lockers', primaryRoute: 'LockerHome', secondaryLabel: 'Contact administrator'
  },
  backendUnavailable: {
    icon: 'server', tone: 'neutral',
    title: 'Backend unavailable',
    message: "Access Lock couldn't reach the authorization service, so no token can be issued right now. Try again shortly.",
    primaryLabel: 'Retry', primaryRoute: 'PersonAScan', secondaryLabel: 'Contact administrator'
  },
  authorizationDenied: {
    icon: 'xCircle', tone: 'danger',
    title: 'Authorization denied',
    message: 'The backend declined to issue a token for this request. Contact your administrator for details.',
    primaryLabel: 'Back to Lockers', primaryRoute: 'LockerHome', secondaryLabel: 'Contact administrator'
  },
  lockerResetCancelled: {
    icon: 'reset', tone: 'neutral',
    title: 'Locker reset by administrator',
    message: 'This session was cancelled from the security dashboard. Start a new request if access is still needed.',
    primaryLabel: 'Start a new request', primaryRoute: 'PersonAScan', secondaryLabel: 'Back to Lockers'
  }
};

const TONE_BG = { amber: colors.amberSoft, danger: colors.dangerSoft, neutral: colors.neutralSoft };
const TONE_FG = { amber: colors.amber, danger: colors.dangerText, neutral: colors.textTertiary };

export function FailureScreen({ route, navigation }: Props) {
  const c = CONFIG[route.params.type];

  return (
    <ScreenContainer>
      <TopBar title="Access Lock" centered />
      <View style={styles.body}>
        <View style={{ flex: 1 }} />
        <View style={[styles.iconCircle, { backgroundColor: TONE_BG[c.tone] }]}>
          <Icon name={c.icon} size={32} color={TONE_FG[c.tone]} strokeWidth={1.6} />
        </View>
        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.message}>{c.message}</Text>
        <View style={{ flex: 1 }} />
        <LockedPill />
        <Button label={c.primaryLabel} onPress={() => navigation.navigate(c.primaryRoute as any)} style={{ marginBottom: 10 }} />
        <Button label={c.secondaryLabel} variant="secondary" onPress={() => navigation.navigate('LockerHome')} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 28, paddingBottom: 16 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary, textAlign: 'center' },
  message: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 21 }
});
