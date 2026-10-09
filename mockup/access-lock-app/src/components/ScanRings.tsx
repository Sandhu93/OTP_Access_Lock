import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, shadow } from '@/theme/tokens';
import { Icon, IconName } from './Icon';

type Props = {
  /** Ring + center-icon color. */
  color?: string;
  centerIcon?: IconName;
  size?: number;
  /** Small filled dot overlaid top-right of the center circle, e.g. "found". */
  showFoundDot?: boolean;
};

const RING_COUNT = 3;
const RING_DURATION = 2400;

/**
 * Animated concentric BLE scanning rings — the refined version of the
 * hand-drawn sketch's radar circles. Pure CSS-keyframe equivalent using
 * RN's Animated API; each ring loops on its own staggered delay.
 */
export function ScanRings({ color = colors.accent, centerIcon = 'bluetooth', size = 220, showFoundDot }: Props) {
  const values = useRef(Array.from({ length: RING_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * (RING_DURATION / RING_COUNT)),
          Animated.timing(v, {
            toValue: 1,
            duration: RING_DURATION,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true })
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [values]);

  const ringSize = size * 0.7;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {values.map((v, i) => {
        const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.55] });
        const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
        return (
          <Animated.View
            key={i}
            style={[
              styles.ring,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                borderColor: color,
                opacity,
                transform: [{ scale }]
              }
            ]}
          />
        );
      })}
      <View style={[styles.center, shadow.card, { borderColor: colors.border }]}>
        <Icon name={centerIcon} size={34} color={color} strokeWidth={1.7} />
      </View>
      {showFoundDot ? <View style={[styles.dot, { backgroundColor: colors.success }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center'
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5
  },
  center: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dot: {
    position: 'absolute',
    top: 24,
    right: 46,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.bg
  }
});
