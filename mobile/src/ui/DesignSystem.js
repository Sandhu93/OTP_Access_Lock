import React, {useEffect, useRef} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export const colors = {
  bg: '#F8F8F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F1ED',
  border: '#E5E4DF',
  borderStrong: '#D1CFC8',
  textPrimary: '#14233B',
  textSecondary: '#536070',
  textTertiary: '#818A96',
  accent: '#E21B23',
  accent600: '#B70F17',
  accentSoft: '#FFF0F1',
  accentSoftBorder: '#F3C5C8',
  success: '#1C7A5E',
  successSoft: '#E0F3EC',
  successSoftBorder: '#B9E4D3',
  amber: '#B67B12',
  amberText: '#7A540C',
  amberSoft: '#FBF0DC',
  amberSoftBorder: '#F0D9A6',
  danger: '#B23A2E',
  dangerText: '#8C2C22',
  dangerSoft: '#FBEAE7',
  dangerSoftBorder: '#F0C4BC',
  neutralSoft: '#EEF1F5',
  neutralText: '#5B6779',
  dbgBg: '#12161C',
  dbgSurface: '#1B212B',
  dbgBorder: '#2B3341',
  dbgText: '#D7DEE8',
  dbgTextDim: '#7D8AA0',
};

export const spacing = {xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32};
export const radii = {button: 12, card: 18, pill: 999};

export function Screen({children, scroll = true, contentStyle}) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.scrollContent, contentStyle]}>{children}</ScrollView>
  ) : (
    <View style={[styles.screenContent, contentStyle]}>{children}</View>
  );
  return <SafeAreaView style={styles.safe}>{content}</SafeAreaView>;
}

export function Button({label, onPress, variant = 'primary', disabled = false, loading = false, style}) {
  const interactive = !disabled && !loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: !interactive}}
      disabled={!interactive}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'ghost' && styles.ghostButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && interactive && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.accent : '#FFFFFF'} />
      ) : (
        <Text style={[styles.buttonText, variant !== 'primary' && variant !== 'danger' && styles.darkButtonText, disabled && styles.disabledText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({children, style}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function TopBar({title, eyebrow, tone = 'accent', onBack, centered = false}) {
  const toneStyle = tone === 'success'
    ? {backgroundColor: colors.successSoft, color: colors.success}
    : tone === 'amber'
      ? {backgroundColor: colors.amberSoft, color: colors.amberText}
      : {backgroundColor: colors.accentSoft, color: colors.accent600};
  return (
    <View>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : <View style={styles.backGhost} />}
        <Text style={[styles.topTitle, centered && styles.centeredTitle]} numberOfLines={1}>{title}</Text>
      </View>
      {eyebrow ? (
        <View style={styles.eyebrowRow}>
          <Text style={[styles.eyebrow, {backgroundColor: toneStyle.backgroundColor, color: toneStyle.color}]}>{eyebrow.toUpperCase()}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function StatusChip({label, tone = 'neutral', icon = '•'}) {
  const toneStyle = {
    neutral: {backgroundColor: colors.neutralSoft, color: colors.neutralText, borderColor: colors.neutralSoft},
    accent: {backgroundColor: colors.accentSoft, color: colors.accent600, borderColor: colors.accentSoftBorder},
    amber: {backgroundColor: colors.amberSoft, color: colors.amberText, borderColor: colors.amberSoftBorder},
    success: {backgroundColor: colors.successSoft, color: colors.success, borderColor: colors.successSoftBorder},
    danger: {backgroundColor: colors.dangerSoft, color: colors.dangerText, borderColor: colors.dangerSoftBorder},
  }[tone];
  return <View style={[styles.chip, toneStyle]}><Text style={{color: toneStyle.color}}>{icon}</Text><Text style={[styles.chipText, {color: toneStyle.color}]}>{label}</Text></View>;
}

export function Banner({text, tone = 'accent'}) {
  const toneStyle = {
    accent: {backgroundColor: colors.accentSoft, borderColor: colors.accentSoftBorder, color: colors.accent600, icon: '盾'},
    success: {backgroundColor: colors.successSoft, borderColor: colors.successSoftBorder, color: colors.success, icon: '✓'},
    amber: {backgroundColor: colors.amberSoft, borderColor: colors.amberSoftBorder, color: colors.amberText, icon: '!'},
    danger: {backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoftBorder, color: colors.dangerText, icon: '×'},
  }[tone];
  return <View style={[styles.banner, toneStyle]}><Text style={[styles.bannerIcon, {color: toneStyle.color}]}>{toneStyle.icon}</Text><Text style={[styles.bannerText, {color: toneStyle.color}]}>{text}</Text></View>;
}

export function LockedPill() {
  return <View style={styles.lockedPill}><Text style={styles.lockedPillText}>⌑  Locker remains locked</Text></View>;
}

export function ScanRings({color = colors.accent, icon = '⌁', found = false, size = 220}) {
  const values = useRef(Array.from({length: 3}, () => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = values.map((value, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * 800),
      Animated.timing(value, {toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true}),
      Animated.timing(value, {toValue: 0, duration: 0, useNativeDriver: true}),
    ])));
    loops.forEach(loop => loop.start());
    return () => loops.forEach(loop => loop.stop());
  }, [values]);
  return (
    <View style={{width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center'}}>
      {values.map((value, index) => (
        <Animated.View key={index} style={[styles.ring, {width: size * 0.7, height: size * 0.7, borderColor: color, opacity: value.interpolate({inputRange: [0, 1], outputRange: [0.6, 0]}), transform: [{scale: value.interpolate({inputRange: [0, 1], outputRange: [0.78, 1.55]})}]}]} />
      ))}
      <View style={[styles.scanCenter, {borderColor: colors.border}]}><Text style={[styles.scanIcon, {color}]}>{icon}</Text></View>
      {found ? <View style={[styles.foundDot, {backgroundColor: colors.success}]} /> : null}
    </View>
  );
}

export function Row({label, value, tone = 'neutral'}) {
  const color = tone === 'success' ? colors.success : tone === 'amber' ? colors.amberText : colors.textPrimary;
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={[styles.rowValue, {color}]}>{value}</Text></View>;
}

export function Timeline({items}) {
  return <View style={styles.timeline}>{items.map((item, index) => <View key={`${item.label}-${index}`} style={styles.timelineRow}><View style={[styles.timelineDot, item.done && {backgroundColor: colors.success, borderColor: colors.success}]}><Text style={styles.timelineCheck}>{item.done ? '✓' : ''}</Text></View><View style={styles.timelineCopy}><Text style={styles.timelineLabel}>{item.label}</Text><Text style={styles.timelineStatus}>{item.status}</Text></View></View>)}</View>;
}

export function BottomNav({active, onNavigate}) {
  const tabs = [
    ['lockers', '⌑', 'Lockers'],
    ['active', '☷', 'Active Request'],
    ['activity', '◷', 'Activity'],
    ['help', '?', 'Help'],
  ];
  return <View style={styles.bottomNav}>{tabs.map(([key, icon, label]) => <Pressable key={key} accessibilityRole="button" onPress={() => onNavigate(key)} style={styles.bottomItem}><Text style={[styles.bottomIcon, {color: active === key ? colors.accent : colors.textTertiary}]}>{icon}</Text><Text style={[styles.bottomLabel, {color: active === key ? colors.accent : colors.textTertiary}]}>{label}</Text></Pressable>)}</View>;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.bg},
  scrollContent: {paddingBottom: 28},
  screenContent: {flex: 1},
  button: {minHeight: 50, borderRadius: radii.button, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16},
  secondaryButton: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong},
  ghostButton: {backgroundColor: 'transparent'},
  dangerButton: {backgroundColor: colors.danger},
  disabledButton: {backgroundColor: colors.neutralSoft, borderColor: colors.neutralSoft},
  pressed: {opacity: 0.84},
  buttonText: {fontSize: 15, fontWeight: '700', color: '#FFFFFF'},
  darkButtonText: {color: colors.textPrimary},
  disabledText: {color: colors.textTertiary},
  card: {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: 20, marginHorizontal: 20, marginBottom: 16},
  topRow: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6},
  backButton: {width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'},
  backGhost: {width: 36, height: 36},
  backGlyph: {fontSize: 28, lineHeight: 30, color: colors.textPrimary},
  topTitle: {fontSize: 18, fontWeight: '700', color: colors.textPrimary, flex: 1},
  centeredTitle: {textAlign: 'center'},
  eyebrowRow: {paddingHorizontal: 20, paddingTop: 10},
  eyebrow: {alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '800', letterSpacing: 0.5},
  chip: {height: 28, paddingHorizontal: 10, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6},
  chipText: {fontSize: 12, fontWeight: '700'},
  banner: {flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, padding: 14, marginHorizontal: 20, marginBottom: 16},
  bannerIcon: {fontSize: 16, fontWeight: '800'},
  bannerText: {flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600'},
  lockedPill: {alignSelf: 'center', backgroundColor: colors.neutralSoft, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 20},
  lockedPillText: {fontSize: 12, fontWeight: '700', color: colors.neutralText},
  ring: {position: 'absolute', borderWidth: 1.5, borderRadius: 999},
  scanCenter: {width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surface, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  scanIcon: {fontSize: 36, fontWeight: '500'},
  foundDot: {position: 'absolute', top: 24, right: 46, width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: colors.bg},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7},
  rowLabel: {fontSize: 13, color: colors.textTertiary},
  rowValue: {fontSize: 13, fontWeight: '700'},
  timeline: {gap: 4},
  timelineRow: {flexDirection: 'row', gap: 12, minHeight: 52},
  timelineDot: {width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center'},
  timelineCheck: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  timelineCopy: {flex: 1},
  timelineLabel: {fontSize: 14, fontWeight: '700', color: colors.textPrimary},
  timelineStatus: {fontSize: 12, color: colors.textTertiary, marginTop: 2},
  bottomNav: {flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingBottom: 14},
  bottomItem: {flex: 1, alignItems: 'center', gap: 4, paddingTop: 10},
  bottomIcon: {fontSize: 21},
  bottomLabel: {fontSize: 11},
});
