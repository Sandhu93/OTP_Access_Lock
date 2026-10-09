import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/theme/tokens';
import { RootStackParamList } from '@/navigation/types';
import { Icon, IconName } from './Icon';

type Tab = 'lockers' | 'activeRequest' | 'activity' | 'help';

const TABS: { key: Tab; label: string; icon: IconName; route?: keyof RootStackParamList }[] = [
  { key: 'lockers', label: 'Lockers', icon: 'lock', route: 'LockerHome' },
  { key: 'activeRequest', label: 'Active Request', icon: 'listCheck', route: 'PersonAApprovedWaitingB' },
  { key: 'activity', label: 'Activity', icon: 'activity', route: 'Activity' },
  { key: 'help', label: 'Help', icon: 'helpCircle' }
];

/**
 * Bottom navigation — shown only on "home base" screens (Lockers,
 * Activity). Active-transaction screens hide it so focus stays on the
 * request in progress, per the product brief.
 */
export function BottomNav({ active }: { active: Tab }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const color = isActive ? colors.accent : colors.textTertiary;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            style={styles.item}
            disabled={!tab.route}
            onPress={() => tab.route && navigation.navigate(tab.route as any)}
          >
            <Icon name={tab.icon} size={21} color={color} strokeWidth={isActive ? 1.9 : 1.7} />
            <Text style={[styles.label, { color, fontFamily: isActive ? fonts.semibold : fonts.regular }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingBottom: 14
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingTop: 10
  },
  label: {
    fontSize: 11
  }
});
