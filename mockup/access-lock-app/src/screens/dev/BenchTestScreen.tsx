import React, { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RootStackParamList } from '@/navigation/types';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'BenchTest'>;

/**
 * Developer-only. This screen is never linked from the production
 * navigation — register it only behind a debug menu / shake gesture in
 * __DEV__ builds, and strip it from release builds entirely before
 * shipping past the ESP32-S3 bench-test hardware stage.
 */
export function BenchTestScreen({ navigation }: Props) {
  const [ledOn, setLedOn] = useState(true);

  return (
    <ScreenContainer dark>
      <View style={styles.banner}>
        <Icon name="alertTriangle" size={18} color="#3A2A05" strokeWidth={2} />
        <View>
          <Text style={styles.bannerTitle}>BENCH TEST · MVP SIMULATION</Text>
          <Text style={styles.bannerSub}>Developer only — not part of the production flow</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <SectionLabel text="Hardware target" />
        <View style={styles.card}>
          <Row label="Board" value="ESP32-S3-DEVKIT (bench)" />
          <Row label="Actuator" value="LED (simulated lock)" valueColor={colors.dbgAmber} />
          <Row label="Firmware" value="access-lock-fw 0.3.1-bench" last />
        </View>

        <SectionLabel text="BLE link" />
        <View style={styles.card}>
          <Row label="Device ID" value="AL-BENCH-0417" />
          <Row label="Service UUID" value="6e400001-b5a3-f393-e0a9" />
          <Row label="Char UUID" value="6e400002-b5a3-f393-e0a9" />
          <Row label="RSSI" value="-54 dBm" valueColor={colors.dbgGreen} />
          <Row label="Link state" value="ENCRYPTED_ESTABLISHED" valueColor={colors.dbgGreen} last />
        </View>

        <SectionLabel text="Firmware status stream" />
        <View style={styles.card}>
          <LogLine time="10:41:02" code="LOCK_IDLE" color={colors.dbgBlue} text="Locker is ready" />
          <LogLine time="10:41:09" code="LOCK_WAITING_TOKEN" color={colors.dbgAmber} text="Waiting for authorization" />
          <LogLine time="10:41:14" code="UNLOCK_OK" color={colors.dbgGreen} text="Access authorized" />
          <LogLine time="—" code="UNLOCK_DENIED" color={colors.dbgRed} text="Authorization denied" />
          <LogLine time="—" code="LOCK_CANCELLED" color={colors.dbgTextDim} text="Request cancelled" />
          <LogLine time="—" code="ERR_TIMEOUT" color={colors.dbgRed} text="Request expired" />
          <LogLine time="—" code="ERR_UNENCRYPTED" color={colors.dbgRed} text="Secure connection not established" />
        </View>

        <SectionLabel text="Simulated authorization token" />
        <View style={styles.card}>
          <Text style={styles.tokenText}>
            SIM_TOKEN sub=AL-20394 exp=+90s alg=demo-only{'\n'}a3f19c22e9•••••••••••••••b8d1 (not a real credential)
          </Text>
          <View style={styles.tokenBtnRow}>
            <Pressable style={styles.tokenBtnPrimary}><Text style={styles.tokenBtnPrimaryText}>Issue simulated token</Text></Pressable>
            <Pressable style={styles.tokenBtnGhost}><Text style={styles.tokenBtnGhostText}>Revoke</Text></Pressable>
          </View>
        </View>

        <SectionLabel text="Actuator test" />
        <View style={styles.card}>
          <View style={styles.row}>
            <View>
              <Text style={styles.actuatorTitle}>Bench LED actuator</Text>
              <Text style={styles.actuatorSub}>Stands in for the physical lock on this MVP unit</Text>
            </View>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: ledOn }}
              onPress={() => setLedOn((v) => !v)}
              style={[styles.toggle, { backgroundColor: ledOn ? colors.dbgGreen : colors.dbgBorder }]}
            >
              <View style={[styles.knob, { left: ledOn ? 22 : 2 }]} />
            </Pressable>
          </View>
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.dbgBorder, marginTop: 6, paddingTop: 10 }]}>
            <Text style={styles.dimMono}>Last actuation</Text>
            <Text style={[styles.dimMono, { color: colors.dbgGreen }]}>OK · 3.1s ago</Text>
          </View>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            This panel is hidden from enrolled users. It never appears inside the production request, approval, or
            unlock flow, and simulated values here are never shown on those screens.
          </Text>
        </View>

        <Pressable onPress={() => navigation.navigate('LockerHome')} style={{ marginTop: 18, alignItems: 'center' }}>
          <Text style={styles.exitLink}>Exit bench test</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function Row({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

function LogLine({ time, code, color, text }: { time: string; code: string; color: string; text: string }) {
  return (
    <Text style={styles.logLine}>
      {time} <Text style={{ color }}>{code}</Text> <Text style={styles.dimMono}>→ "{text}"</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#D89A2E', paddingHorizontal: 20, paddingVertical: 12 },
  bannerTitle: { fontFamily: fonts.bold, fontSize: 13, color: '#3A2A05', letterSpacing: 0.3 },
  bannerSub: { fontFamily: fonts.semibold, fontSize: 11, color: '#3A2A05' },
  scroll: { padding: 20 },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: colors.dbgTextDim, marginTop: 18, marginBottom: 8, textTransform: 'uppercase' },
  card: { backgroundColor: colors.dbgSurface, borderWidth: 1, borderColor: colors.dbgBorder, borderRadius: 12, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.dbgBorder },
  rowLabel: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.dbgTextDim },
  rowValue: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.dbgText },
  logLine: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.dbgTextDim, lineHeight: 22 },
  dimMono: { fontFamily: fonts.mono, color: colors.dbgTextDim, fontSize: 12 },
  tokenText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.dbgTextDim, lineHeight: 18 },
  tokenBtnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tokenBtnPrimary: { flex: 1, height: 38, borderRadius: 8, backgroundColor: colors.dbgGreen, alignItems: 'center', justifyContent: 'center' },
  tokenBtnPrimaryText: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '700', color: '#0C1712' },
  tokenBtnGhost: { flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.dbgBorder, alignItems: 'center', justifyContent: 'center' },
  tokenBtnGhostText: { fontFamily: fonts.mono, fontSize: 12, color: colors.dbgTextDim },
  actuatorTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.dbgText },
  actuatorSub: { fontFamily: fonts.mono, fontSize: 11, color: colors.dbgTextDim, marginTop: 2 },
  toggle: { width: 46, height: 26, borderRadius: 13, justifyContent: 'center' },
  knob: { position: 'absolute', top: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  noteBox: { marginTop: 18, padding: 12, borderWidth: 1, borderColor: colors.dbgBorder, borderStyle: 'dashed', borderRadius: 10 },
  noteText: { fontFamily: fonts.mono, fontSize: 11, color: colors.dbgTextDim, lineHeight: 17 },
  exitLink: { fontFamily: fonts.mono, fontSize: 12, color: colors.dbgTextDim }
});
